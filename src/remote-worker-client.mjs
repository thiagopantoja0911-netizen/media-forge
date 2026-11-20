import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile, access } from "node:fs/promises";
import { resolve, join, relative, sep, basename } from "node:path";
import { hostname } from "node:os";
import { renderWithHyperFrames } from "./renderers/hyperframes.mjs";
import { renderWithRemotion } from "./renderers/remotion.mjs";
import { inspectRenderedVideo, inspectRenderedAudio } from "./video-qa.mjs";
import { collectRenderResources } from "./render-recovery.mjs";
import { readFile } from "node:fs/promises";
import { mixCinematicAudio } from "./cinematic-audio-mix.mjs";
import { inspectRenderedFrames } from "./video-qa.mjs";
import { reviewCinematicPolicyV2 } from "./cinematic-production-policy.mjs";

const url=String(process.env.MEDIAFORGE_REMOTE_URL||"").replace(/\/$/,"");
const token=process.env.MEDIAFORGE_WORKER_TOKEN||"";
const workerId=process.env.MEDIAFORGE_WORKER_ID||hostname();
const projectsRoot=resolve(process.env.MEDIAFORGE_PROJECTS_DIR||".mediaforge/projects");
const pollMs=Number(process.env.MEDIAFORGE_POLL_MS||4000);
if(!/^https:\/\//.test(url) && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url))
  throw new Error("MEDIAFORGE_REMOTE_URL must use HTTPS (or localhost for testing)");
if(token.length<32)throw new Error("MEDIAFORGE_WORKER_TOKEN must be configured");

function safePath(path) {
  return typeof path==="string"&&path.length>0&&!/^[A-Za-z]:/.test(path)
    && !path.startsWith("/")&&!path.startsWith("\\")
    && !path.includes("\0")&&!path.split(/[\\/]/).includes("..");
}
function inside(root,target) {
  const r=relative(root,target);
  return r && r!==".." && !r.startsWith(".."+sep) && !/^(?:[\\/]|[A-Za-z]:)/.test(r);
}
async function call(path, method="GET", body, leaseId) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),45_000);
  try{
    const res=await fetch(url+path,{method,headers:{
      authorization:"Bearer "+token,
      ...(body?{"content-type":"application/json"}:{}),
      ...(leaseId?{"x-mediaforge-lease":leaseId}:{})
    },body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data=await res.json();
    if(!res.ok||data.ok!==true)throw new Error("Remote "+res.status+": "+(data.error||"invalid response"));
    return data;
  }finally{clearTimeout(timeout);}
}
async function uploadDeliveredArtifact(jobId,leaseId,outputPath){
  const fileSize=(await stat(outputPath)).size;
  const sha=await hashFile(outputPath);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10*60*1000);
  try{
    const response=await fetch(url+"/v1/worker/jobs/"+jobId+"/artifact",{
      method:"POST",duplex:"half",body:createReadStream(outputPath),
      headers:{authorization:"Bearer "+token,
        "x-mediaforge-lease":leaseId,
        "x-mediaforge-artifact-sha256":sha,
        "content-length":String(fileSize),
        "content-type":"video/mp4"},
      signal:controller.signal
    });
    const data=await response.json();
    if(!response.ok||data.ok!==true||data.sha256!==sha)
      throw new Error("MediaForge MP4 delivery failed: "+(data.error||response.status));
    return data;
  }finally{clearTimeout(timer);}
}
async function sendHeartbeat(active) {
  return call("/v1/worker/heartbeat","POST",{
    workerId,renderer:"hyperframes",
    jobId:active?.id,leaseId:active?.leaseId
  });
}
async function downloadProject(id,leaseId){
  const result=await call("/v1/worker/jobs/"+id+"/project","GET",undefined,leaseId);
  const root=resolve(projectsRoot,id);
  await mkdir(root,{recursive:true});
  if(!Array.isArray(result.files)||result.files.length>80)throw new Error("Invalid project files");
  let total=0;
  for(const file of result.files){
    if(!safePath(file.path))throw new Error("Unsafe project path");
    const path=resolve(root,file.path);
    if(!inside(root,path))throw new Error("Project path escaped root");
    const data=Buffer.from(file.contentBase64||"","base64");
    total+=data.length;
    if(total>24*1024*1024)throw new Error("Project transfer too large");
    if(createHash("sha256").update(data).digest("hex")!==file.sha256)throw new Error("Project file checksum mismatch: "+file.path);
    await mkdir(resolve(path,".."),{recursive:true});
    await writeFile(path,data);
  }
  await access(join(root,"index.html"));
}
async function hashFile(path) {
  const hash=createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function processRemote(job,leaseId) {
  const active={id:job.id,leaseId};
  const renderAbort=new AbortController();
  const throwIfCancelled=()=>{
    if(renderAbort.signal.aborted)throw Object.assign(new Error("Render cancelado pelo usuario"),{code:"JOB_CANCELLED",retryable:false});
  };
  let lastReportAt=0,lastReportPct=-1;
  const report=async (progress,message,detail={})=>{
    const now=Date.now();
    // Native frame events can be emitted much more often than network heartbeat events.
    if(progress===lastReportPct && now-lastReportAt<5000)return;
    lastReportAt=now;lastReportPct=progress;
    try{
      await call("/v1/worker/jobs/"+job.id+"/progress","POST",{
        leaseId,progress,message,...detail
      });
    }catch(error){console.warn("Could not report render progress:",error.message);}
  };
  const interval=setInterval(()=>
    sendHeartbeat(active).then(result=>{
      if(result.cancelRequested)renderAbort.abort();
    }).catch(error=>console.error("Heartbeat failed:",error.message)),15000);
  try{
    await report(12,"Baixando projeto no computador Windows",{phase:"downloading"});
    await downloadProject(job.id,leaseId);
    throwIfCancelled();
    const configured={...job,project:{...job.project,sourceDir:job.id}};
    if(!["hyperframes","remotion"].includes(configured.project.renderer))throw new Error("Unsupported renderer for remote worker");
    const rendered=configured.project.renderer==="remotion"
      ?await renderWithRemotion(configured)
      :await renderWithHyperFrames(configured,{onProgress:report,signal:renderAbort.signal});
    throwIfCancelled();
    await report(93,"Render concluído; validando arquivo MP4",{phase:"technical-qa"});
    let info=await stat(rendered.outputPath);
    if(!info.isFile()||info.size===0)throw new Error("Video artifact missing or empty");
    const isCinematicV2=configured.metadata?.productionMode==="cinematic"&&configured.metadata?.cinematicPolicyVersion==="v2";
    const projectDir=resolve(projectsRoot,job.id);
    let cinematicPlan=null,audioMix=null;
    if(isCinematicV2){
      cinematicPlan=JSON.parse(await readFile(join(projectDir,"motion-plan.json"),"utf8"));
      audioMix=await mixCinematicAudio({videoPath:rendered.outputPath,projectDir,plan:cinematicPlan});
      info=await stat(rendered.outputPath);
    }
    const technicalQA=await inspectRenderedVideo(rendered.outputPath,{...configured.project,width:rendered.motionReview?.width,height:rendered.motionReview?.height}, 
      configured.metadata?.expectsAudio===true || rendered.motionReview?.expectsAudio===true);
    if(technicalQA.status==="failed") {
      const error=new Error("O MP4 falhou no QA técnico: "+technicalQA.issues.join("; "));
      error.code="VIDEO_TECHNICAL_QA_FAILED";
      throw error;
    }
    if(technicalQA.status==="unverified") {
      console.warn("QA técnico não verificado:",technicalQA.issues.join("; "));
    }
    if(isCinematicV2&&technicalQA.status!=="passed"){
      const error=new Error("Cinematic V2 exige FFprobe aprovado: "+(technicalQA.issues||[]).join("; "));
      error.code="CINEMATIC_TECHNICAL_QA_REQUIRED";error.retryable=false;throw error;
    }
    const durationSeconds=cinematicPlan?cinematicPlan.totalFrames/(Number(String(cinematicPlan.fps).split("/")[0])/Number(String(cinematicPlan.fps).split("/")[1]||1)):undefined;
    const audioQA=configured.metadata?.productionMode==="cinematic"
      ?await inspectRenderedAudio(rendered.outputPath,{durationSeconds}):null;
    if(audioQA&&audioQA.status!=="passed"){
      const error=new Error("Cinematic audio QA failed: "+(audioQA.issues||[]).join("; "));
      error.code="AUDIO_MIX_QA_FAILED";error.retryable=false;throw error;
    }
    const frameQA=isCinematicV2?await inspectRenderedFrames(rendered.outputPath,{plan:cinematicPlan,durationSeconds}):null;
    if(isCinematicV2&&frameQA?.status!=="passed"){
      const error=new Error("Cinematic V2 frame inspection failed: "+(frameQA?.issues||[]).join("; "));
      error.code="CINEMATIC_FRAME_QA_FAILED";error.retryable=false;throw error;
    }
    const cinematicPolicy=isCinematicV2?reviewCinematicPolicyV2(cinematicPlan,{
      assetValidation:configured.metadata?.assetValidation,technicalQA,audioQA,frameQA,renderComplete:true,motionBlurApplied:rendered.motionBlurApplied===true,artisticQA:"pending-user-review"
    }):null;
    if(isCinematicV2&&!cinematicPolicy?.ok){
      const error=new Error("Cinematic V2 final structural QA failed: "+(cinematicPolicy?.errors||[]).join("; "));
      error.code="CINEMATIC_POLICY_QA_FAILED";error.retryable=false;throw error;
    }
    // Full Frame Lab workflow: the output must return to the web service for real comparison.
    // A failed upload fails the job instead of falsely marking the pipeline completed.
    // Every completed video must be retrievable in ChatGPT, not stranded on Windows.
    // A failed upload fails the job, instead of falsely reporting completed.
    throwIfCancelled();
    await report(96,"Enviando MP4 validado para o MediaForge",{phase:"uploading"});
    const artifactUploaded=Boolean((await uploadDeliveredArtifact(job.id,leaseId,rendered.outputPath)).ok);
    await call("/v1/worker/jobs/"+job.id+"/complete","POST",{
      leaseId,success:true,artifactUploaded,fileName:basename(rendered.outputPath),size:info.size,
      sha256:await hashFile(rendered.outputPath),outputPath:rendered.outputPath,
      report:{outputName:basename(rendered.outputPath),technicalQA,audioQA,frameQA,audioMix,motionBlurApplied:rendered.motionBlurApplied===true,motionBlurShutterAngle:rendered.motionBlurShutterAngle,cinematicPolicy,motionReview:rendered.motionReview??null,diagnosticsDir:rendered.diagnosticsDir,artisticQA:"pending-user-review",finalDeliveryApproved:false}
    });
    console.log("Remote job completed:",job.id);
  }catch(error){
    console.error("Remote job failed:",job.id,error.stack||error.message);
    const resources = await collectRenderResources(projectsRoot).catch((snapshotError) => ({
      unavailable: true,
      reason: String(snapshotError?.message ?? snapshotError).slice(0, 240)
    }));
    const failure = {
      code: String(error.code || "REMOTE_RENDER_FAILED").slice(0, 100),
      message: String(error.message || error).slice(0, 12000),
      recoverable: error.recoverable === true,
      retryable: error.retryable === true,
      retryAttempts: Number.isSafeInteger(error.retryAttempts) ? error.retryAttempts : null,
      diagnostics: {
        ...(error.diagnostics && typeof error.diagnostics === "object" ? error.diagnostics : {}),
        resources,
        stack: String(error.stack || "").slice(0, 12000)
      }
    };
    try{await call("/v1/worker/jobs/"+job.id+"/complete","POST",{
      leaseId,success:false,error:failure
    });}catch(e){console.error("Could not report failure:",e.message);}
  }finally{clearInterval(interval);}
}
await mkdir(projectsRoot,{recursive:true});
console.log("MediaForge remote Windows worker connecting to",url);
while(true){
  try{
    await sendHeartbeat();
    const next=await call("/v1/worker/claim","POST",{workerId});
    if(next.job)await processRemote(next.job,next.leaseId);
  }catch(error){console.error("Remote connection error:",error.message);}
  if(process.argv.includes("--once"))break;
  await new Promise(r=>setTimeout(r,pollMs));
}
