import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile, access } from "node:fs/promises";
import { resolve, join, relative, sep, basename } from "node:path";
import { hostname } from "node:os";
import { renderWithHyperFrames } from "./renderers/hyperframes.mjs";
import { inspectRenderedVideo, inspectRenderedAudio } from "./video-qa.mjs";
import { executeMaintenanceTask } from "./maintenance-worker.mjs";
import { spawn } from "node:child_process";

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
async function uploadFrameLabArtifact(jobId,leaseId,outputPath){
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
      throw new Error("Frame Lab MP4 upload failed: "+(data.error||response.status));
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
  const interval=setInterval(()=>sendHeartbeat(active).catch((error)=>
    console.error("Heartbeat failed:",error.message)),15000);
  try{
    await downloadProject(job.id,leaseId);
    const configured={...job,project:{...job.project,sourceDir:job.id}};
    if(configured.project.renderer!=="hyperframes")throw new Error("Unsupported renderer for remote worker");
    const rendered=await renderWithHyperFrames(configured);
    const info=await stat(rendered.outputPath);
    if(!info.isFile()||info.size===0)throw new Error("Video artifact missing or empty");
    const technicalQA=await inspectRenderedVideo(rendered.outputPath,{...configured.project,width:rendered.motionReview?.width,height:rendered.motionReview?.height},
      configured.metadata?.expectsAudio===true || rendered.motionReview?.expectsAudio===true);
    if(technicalQA.status==="failed") {
      const error=new Error("O MP4 falhou no QA técnico: "+technicalQA.issues.join("; "));
      error.code="VIDEO_TECHNICAL_QA_FAILED";
      throw error;
    }
    if(technicalQA.status==="unverified") {
      console.warn("QA técnico não verificado:", technicalQA.issues.join("; "));
    }
    const audioQA = configured.metadata?.productionMode === "cinematic"
      ? await inspectRenderedAudio(rendered.outputPath) : null;
    if(audioQA && audioQA.status !== "passed") {
      const error = new Error("Cinematic audio QA failed: " + (audioQA.issues||[]).join("; "));
      error.code = "AUDIO_MIX_QA_FAILED";
      error.retryable = false;
      throw error;
    }
    // Full Frame Lab workflow: the output must return to the web service for real comparison.
    // A failed upload fails the job instead of falsely marking the pipeline completed.
    const artifactUploaded=job.metadata?.source==="frame-lab"
      ? Boolean((await uploadFrameLabArtifact(job.id,leaseId,rendered.outputPath)).ok) : false;
    await call("/v1/worker/jobs/"+job.id+"/complete","POST",{
      leaseId,success:true,artifactUploaded,fileName:basename(rendered.outputPath),size:info.size,
      sha256:await hashFile(rendered.outputPath),outputPath:rendered.outputPath,
      report:{outputName:basename(rendered.outputPath),technicalQA,audioQA,motionReview:rendered.motionReview??null,diagnosticsDir:rendered.diagnosticsDir,artisticQA:"pending-user-review"}
    });
    console.log("Remote job completed:",job.id);
  }catch(error){
    console.error("Remote job failed:",job.id,error.stack||error.message);
    try{await call("/v1/worker/jobs/"+job.id+"/complete","POST",{
      leaseId,success:false,error:String(error.stack||error.message).slice(0,15000)
    });}catch(e){console.error("Could not report failure:",e.message);}
  }finally{clearInterval(interval);}
}
await mkdir(projectsRoot,{recursive:true});
console.log("MediaForge remote Windows worker connecting to",url);
while(true){
  try{
    await sendHeartbeat();
    const maintenance=await call("/v1/worker/maintenance/claim","POST",{workerId});
    if(maintenance.task){
      const task=maintenance.task;
      let report=null,error=null;
      try{report=await executeMaintenanceTask(task);}catch(ex){error=String(ex.message||ex).slice(0,500);}
      await call("/v1/worker/maintenance/complete","POST",{
        id:task.id,leaseId:task.leaseId,workerId,success:!error,report,error
      });
      if(!error&&report?.restartRequired&&process.platform==="win32"){
        const root=process.cwd();
        const script=join(root,"desktop","start-worker-background.ps1");
        const scriptArg=script.replaceAll("'","''");
        const rootArg=root.replaceAll("'","''");
        const child=spawn("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-Command",
          "Start-Sleep -Seconds 3; & '"+scriptArg+"' -InstallDir '"+rootArg+"'"],
          {cwd:root,detached:true,windowsHide:true,stdio:"ignore"});
        child.unref();
      }
      continue;
    }
    const next=await call("/v1/worker/claim","POST",{workerId});
    if(next.job)await processRemote(next.job,next.leaseId);
  }catch(error){console.error("Remote connection error:",error.message);}
  if(process.argv.includes("--once"))break;
  await new Promise(r=>setTimeout(r,pollMs));
}
