import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { makeEditorProject, loadEditorProject, saveEditorProject, latestEditorProject, updateEditorProject, editorStoreDir, validateEditorProject } from "./editor-studio-core.mjs";
import { buildEditorIndex, buildEditorSceneModule, buildEditorRenderFiles } from "./editor-studio-engine.mjs";
import { auditMotionV2 } from "./editor-motion-v2.mjs";
import { signedVideoDownload } from "./video-artifact-delivery.mjs";
import { createEditorHomologationProject } from "./editor-homologation.mjs";
import { readEditorPreviewReview, saveEditorPreviewReview, requireApprovedEditorPreview } from "./editor-review-gate.mjs";
import { storeEditorVisualAsset, loadEditorVisualAsset } from "./editor-visual-assets.mjs";
import { storeEditorLayerAsset, loadEditorLayerAsset } from "./editor-layer-assets.mjs";
import { buildEditorStyleDna, listEditorStylePresets, applyEditorStylePreset } from "./editor-style-presets.mjs";
import { decodeAudioToPcm, analyzePcmForBeats, synchronizeSceneCutsToBeats } from "./editor-beat-sync.mjs";
import { demoProject as remotionDemoProject } from "../remotion/project.mjs";
import { buildHyperFramesHtml } from "../remotion/hyperframes-html.mjs";

const idReg=/^[a-f0-9]{32}$/;
const contentTypes={mp3:"audio/mpeg",m4a:"audio/mp4",wav:"audio/wav",ogg:"audio/ogg"};
const staticFiles=new Map([
  ["/editor","../editor-studio/index.html"],
  ["/editor/","../editor-studio/index.html"],
  ["/editor/app.js","../editor-studio/app.js"],
  ["/editor/remotion-player.html","../editor-studio/remotion-player.html"],
  ["/editor/remotion-player.js","../editor-studio/remotion-player.js"],
  ["/editor/remotion-toggle.js","../editor-studio/remotion-toggle.js"],
  ["/editor/remotion-assets/background.mp4","../remotion-public/remotion-assets/background.mp4"],
  ["/editor/remotion-assets/badge.png","../remotion-public/remotion-assets/badge.png"],
  ["/editor/style.css","../editor-studio/style.css"],
  ["/editor/workspace-layout.css","../editor-studio/workspace-layout.css"],
  ["/editor/motion-v2.css","../editor-studio/motion-v2.css"],
  ["/editor/motion-v2.js","../editor-studio/motion-v2.js"],
  ["/editor/workspace-layout.js","../editor-studio/workspace-layout.js"],
  ["/editor/queue-panel.js","../editor-studio/queue-panel.js"],
  ["/editor/vendor/three.module.js","../node_modules/three/build/three.module.js"],
  ["/editor/vendor/three.core.js","../node_modules/three/build/three.core.js"],
  ["/editor/vendor/gsap.min.js","../assets/gsap.min.js"]
]);
const textType=path=>path.endsWith(".mp4")?"video/mp4":path.endsWith(".webm")?"video/webm":path.endsWith(".png")?"image/png":path.endsWith(".css")?"text/css; charset=utf-8":path.endsWith(".js")||path.endsWith(".mjs")?"text/javascript; charset=utf-8":"text/html; charset=utf-8";
const headers={"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8",...headers});res.end(JSON.stringify(data));}
function replyText(res,status,type,body,extra={}){
  res.writeHead(status,{"content-type":type,...headers,...extra});
  res.end(body);
}
function replyVideoRange(request,response,type,bytes){
  const range=request.headers.range;
  if(!range){
    response.writeHead(200,{"content-type":type,"content-length":bytes.length,"accept-ranges":"bytes",...headers});
    response.end(bytes);return;
  }
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match){response.writeHead(416,{"content-range":"bytes */"+bytes.length,...headers});response.end();return;}
  const start=match[1]?Number(match[1]):0;
  const end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=bytes.length){
    response.writeHead(416,{"content-range":"bytes */"+bytes.length,...headers});response.end();return;
  }
  response.writeHead(206,{"content-type":type,"content-length":end-start+1,
    "content-range":"bytes "+start+"-"+end+"/"+bytes.length,"accept-ranges":"bytes",...headers});
  response.end(bytes.subarray(start,end+1));
}
function assertSameOrigin(request){
  const site=String(request.headers?.["sec-fetch-site"]||"").toLowerCase();
  if(site&&!["none","same-origin"].includes(site))throw Object.assign(new Error("Origem cruzada não autorizada."),{status:403});
  const origin=request.headers?.origin;
  if(origin&&request.headers?.host){
    let originHost="";try{originHost=new URL(origin).host.toLowerCase();}catch{}
    if(originHost!==String(request.headers.host).toLowerCase())
      throw Object.assign(new Error("Origem cruzada não autorizada."),{status:403});
  }
}
function validIndex(v,p){
  const n=Number(v);
  if(!Number.isInteger(n)||n<0||n>=p.scenes.length)throw Object.assign(new Error("Cena não encontrada."),{status:404});
  return n;
}
const audioPath=(id,assetId,extension)=>join(editorStoreDir(),id+"-audio-"+assetId+"."+extension);
function validAudioBytes(buffer,ext){
  if(buffer.length<32||buffer.length>10*1024*1024)return false;
  if(ext==="mp3")return buffer.subarray(0,3).toString()==="ID3"||(buffer[0]===255&&(buffer[1]&0xe0)===0xe0);
  if(ext==="wav")return buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WAVE";
  if(ext==="m4a")return buffer.subarray(4,8).toString()==="ftyp";
  if(ext==="ogg")return buffer.subarray(0,4).toString()==="OggS";
  return false;
}
async function receiveAudio(project,body){
  const filename=String(body.filename??"").slice(0,90),ext=filename.split(".").at(-1).toLowerCase();
  if(!Object.hasOwn(contentTypes,ext)||typeof body.base64!=="string"||body.base64.length>14e6||
     !/^[a-zA-Z0-9+/]+={0,2}$/.test(body.base64))
    throw Object.assign(new Error("Áudio inválido; envie MP3, M4A, WAV ou OGG com até 10 MB."),{status:422});
  const data=Buffer.from(body.base64,"base64");
  if(!validAudioBytes(data,ext))throw Object.assign(new Error("O arquivo não é um áudio válido do formato selecionado."),{status:422});
  const role=["voice","music","sfx"].includes(body.role)?body.role:"voice";
  const start=Math.max(0,Math.min(project.totalFrames-1,Math.round(Number(body.start_seconds||0)*project.fps)));
  const end=Number.isFinite(Number(body.duration_seconds))&&Number(body.duration_seconds)>0
    ?Math.min(project.totalFrames,start+Math.max(1,Math.round(Number(body.duration_seconds)*project.fps)))
    :project.totalFrames;
  const volume=Number.isFinite(Number(body.volume))?Math.max(0,Math.min(1,Number(body.volume))):role==="music"?.24:1;
  const id=randomUUID().replaceAll("-","");
  const updated={...project,...(role==="music"?{beatSync:undefined}:{}),audio:[...project.audio,{id,assetId:id,role,extension:ext,name:filename,startFrame:start,endFrame:end,volume}]};
  validateEditorProject(updated);
  await mkdir(editorStoreDir(),{recursive:true});
  await writeFile(audioPath(project.id,id,ext),data,{flag:"wx"});
  return saveEditorProject(updated,{expectedRevision:project.revision});
}
export async function handleEditorStudioHttp({request,response,url,isAdminSession,parseBody,createJob,getJob}){
  const path=url.pathname;
  if(!(path==="/editor"||path.startsWith("/editor/")||path.startsWith("/api/editor/")))return false;
  const authenticated=await isAdminSession(request);
  if(!authenticated){
    if(path.startsWith("/api/"))json(response,401,{ok:false,error:"AUTH_REQUIRED"});
    else {response.writeHead(303,{location:"/dashboard",...headers});response.end();}
    return true;
  }
  if(staticFiles.has(path)){
    if(request.method!=="GET"&&request.method!=="HEAD"){json(response,405,{error:"METHOD_NOT_ALLOWED"});return true;}
    const file=staticFiles.get(path);
    const content=await readFile(new URL(file,import.meta.url));
    const policy=path.endsWith(".html")||path==="/editor"||path==="/editor/"?
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self'; media-src 'self' blob:; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'":
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'";
    replyText(response,200,textType(path),request.method==="HEAD"?"":content,{"content-security-policy":policy});
    return true;
  }
  if(!path.startsWith("/api/editor/")){json(response,404,{error:"NOT_FOUND"});return true;}
  const pieces=path.split("/").filter(Boolean);
  try{
    if(pieces.length===4&&pieces[2]==="remotion"&&pieces[3]==="demo"&&request.method==="GET"){
      json(response,200,{ok:true,project:remotionDemoProject,engine:"remotion",editor:"MediaForge"});return true;
    }
    if(pieces.length===4&&pieces[2]==="hyperframes"&&pieces[3]==="render"&&request.method==="POST"){
      assertSameOrigin(request);
      const body=await parseBody(request);
      if(body.confirm!==true){json(response,428,{ok:false,error:"RENDER_CONFIRMATION_REQUIRED"});return true;}
      const movie=await readFile(new URL("../remotion-public/remotion-assets/background.mp4",import.meta.url));
      const badge=await readFile(new URL("../remotion-public/remotion-assets/badge.png",import.meta.url));
      const gsap=await readFile(new URL("../assets/gsap.min.js",import.meta.url),"utf8");
      const sourceFiles=[
        {path:"index.html",content:buildHyperFramesHtml(remotionDemoProject)},
        {path:"remotion/project.json",content:JSON.stringify(remotionDemoProject)},
        {path:"assets/background.mp4",contentBase64:movie.toString("base64")},
        {path:"assets/badge.png",contentBase64:badge.toString("base64")},
        {path:"assets/gsap.min.js",content:gsap}
      ];
      const job=await createJob({
        prompt:"MediaForge Etapa 1: renderizar a mesma composição de três camadas via HyperFrames CLI no PC Windows — vídeo de fundo, PNG sobreposto e texto animado.",
        project:{title:remotionDemoProject.title,durationSeconds:12,aspectRatio:"9:16",
          outputs:["video"],renderer:"hyperframes",fps:30,quality:"high",preflight:true},
        projectFiles:sourceFiles,
        metadata:{source:"mediaforge-visual-editor",mode:"controlled-test",engine:"hyperframes-cli",
          remotionProjectId:remotionDemoProject.id,expectsAudio:false,productionMode:"study",
          artisticQA:"pending-user-review"}
      });
      json(response,202,{ok:true,jobId:job.id,status:job.status,engine:"hyperframes"});return true;
    }
    if(pieces.length===3&&pieces[2]==="styles"&&request.method==="GET"){
      json(response,200,{ok:true,styles:listEditorStylePresets()});return true;
    }
    if(pieces.length===3&&pieces[2]==="latest"&&request.method==="GET"){
      json(response,200,{ok:true,project:await latestEditorProject()});return true;
    }
    if(pieces.length===3&&pieces[2]==="projects"&&request.method==="POST"){
      assertSameOrigin(request);
      const project=await saveEditorProject(makeEditorProject(await parseBody(request)));
      json(response,201,{ok:true,project,editorUrl:"/editor?project="+project.id});return true;
    }
    if(pieces.length===3&&pieces[2]==="homologation"&&request.method==="POST"){
      assertSameOrigin(request);
      const result=await createEditorHomologationProject();
      json(response,201,{ok:true,project:result.project,audio:result.audio,
        assets:result.visualAssets,editorUrl:"/editor?project="+result.project.id,
        nextSteps:result.nextSteps});
      return true;
    }
    const id=pieces[3];
    if(pieces[2]!=="projects"||!idReg.test(id)){json(response,404,{error:"NOT_FOUND"});return true;}
    const p=await loadEditorProject(id);
    if(pieces.length===4&&request.method==="GET"){json(response,200,{ok:true,project:p});return true;}
    if(pieces.length===4&&request.method==="PUT"){
      assertSameOrigin(request);
      const body=await parseBody(request);
      const next=updateEditorProject(p,body.project);
      const saved=await saveEditorProject(next,{expectedRevision:p.revision});
      json(response,200,{ok:true,project:saved});return true;
    }
    if(pieces.length===5&&pieces[4]==="motion-qa"&&request.method==="GET"){
      json(response,200,{ok:true,qa:auditMotionV2(p),next:"Para análise óptica real, exporte o MP4 e compare no Frame Lab."});return true;
    }
    if(pieces.length===5&&pieces[4]==="style-dna"&&request.method==="GET"){
      json(response,200,{ok:true,dna:buildEditorStyleDna(p)});return true;
    }
    if(pieces.length===5&&pieces[4]==="style"&&request.method==="POST"){
      assertSameOrigin(request);
      const body=await parseBody(request);
      const next=applyEditorStylePreset(p,body.style_preset);
      validateEditorProject(next);
      const project=await saveEditorProject(next,{expectedRevision:p.revision});
      json(response,200,{ok:true,project});return true;
    }
    if(pieces.length===5&&pieces[4]==="assets"&&request.method==="POST"){
      assertSameOrigin(request);
      const result=await storeEditorVisualAsset(p,await parseBody(request));
      json(response,201,{ok:true,...result});return true;
    }
    if(pieces.length===5&&pieces[4]==="layer-assets"&&request.method==="POST"){
      assertSameOrigin(request);
      const result=await storeEditorLayerAsset(p,await parseBody(request));
      json(response,201,{ok:true,...result});return true;
    }
    if(pieces.length===6&&pieces[4]==="layer-assets"&&request.method==="GET"){
      const {asset,bytes}=await loadEditorLayerAsset(p,pieces[5]);
      replyVideoRange(request,response,asset.mime,bytes);
      return true;
    }
    if(pieces.length===6&&pieces[4]==="assets"&&request.method==="GET"){
      const {asset,bytes}=await loadEditorVisualAsset(p,pieces[5]);
      replyText(response,200,asset.mime,bytes,{"content-security-policy":"default-src 'none'; sandbox"});
      return true;
    }
    if(pieces.length===5&&pieces[4]==="preview"&&request.method==="GET"){
      const scene=validIndex(url.searchParams.get("scene")??0,p);
      const html=buildEditorIndex(p,{sceneIndex:scene,preview:true,projectId:p.id});
      replyText(response,200,"text/html; charset=utf-8",html,{
        "content-security-policy":"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'"
      });return true;
    }
    if(pieces.length===5&&pieces[4]==="scene.mjs"&&request.method==="GET"){
      const scene=validIndex(url.searchParams.get("scene")??0,p);
      replyText(response,200,"text/javascript; charset=utf-8",buildEditorSceneModule(p,{sceneIndex:scene,preview:true}));return true;
    }
    if(pieces.length===6&&pieces[4]==="audio"&&request.method==="GET"){
      const track=p.audio.find(a=>a.assetId===pieces[5]);
      if(!track){json(response,404,{error:"AUDIO_NOT_FOUND"});return true;}
      const file=await readFile(audioPath(p.id,track.assetId,track.extension));
      replyText(response,200,contentTypes[track.extension],file);return true;
    }
    if(pieces.length===5&&pieces[4]==="audio"&&request.method==="POST"){
      assertSameOrigin(request);
      const updated=await receiveAudio(p,await parseBody(request));
      json(response,201,{ok:true,project:updated});return true;
    }
    if(pieces.length===5&&pieces[4]==="beat-sync"&&request.method==="POST"){
      assertSameOrigin(request);
      const body=await parseBody(request);
      const requested=typeof body.audioId==="string"?body.audioId:"";
      const track=p.audio.find(a=>a.role==="music"&&(!requested||a.id===requested||a.assetId===requested));
      if(!track)throw Object.assign(new Error("Adicione ou selecione uma faixa com o papel Música antes de sincronizar."),{code:"MUSIC_TRACK_REQUIRED",status:422});
      const bytes=await readFile(audioPath(p.id,track.assetId,track.extension));
      const maxSeconds=Math.min(60,(track.endFrame-track.startFrame)/p.fps);
      const samples=await decodeAudioToPcm(bytes,{maxSeconds});
      const analysis=analyzePcmForBeats(samples);
      const synced=synchronizeSceneCutsToBeats(p,analysis,track);
      const updated=await saveEditorProject(synced.project,{expectedRevision:p.revision});
      json(response,200,{ok:true,project:updated,
        analysis:{bpm:analysis.bpm,confidence:analysis.confidence,beatCount:analysis.beatTimes.length,
          beatIntervalSeconds:analysis.beatIntervalSeconds,durationSeconds:analysis.durationSeconds},
        sync:{syncedCuts:synced.syncedCuts,totalCuts:synced.totalCuts,cutFrames:synced.cutFrames,
          offsetFrames:synced.offsetFrames,maxShiftSeconds:synced.maxShiftSeconds}});
      return true;
    }

    if(pieces.length===5&&pieces[4]==="review"&&request.method==="GET"){
      json(response,200,{ok:true,...await readEditorPreviewReview(p)});return true;
    }
    if(pieces.length===5&&pieces[4]==="review"&&request.method==="POST"){
      assertSameOrigin(request);
      const review=await saveEditorPreviewReview(p,await parseBody(request));
      json(response,200,{ok:true,...review,message:review.approved
        ?"Prévia aprovada na revisão atual. Renderização liberada."
        :"Prévia reprovada. Corrija a timeline e verifique novamente."});return true;
    }
    if(pieces.length===5&&pieces[4]==="render"&&request.method==="POST"){
      assertSameOrigin(request);
      const raw=await parseBody(request);
      if(raw.confirm!==true){json(response,428,{ok:false,error:"RENDER_CONFIRMATION_REQUIRED"});return true;}
      const sceneIndex=raw.sceneIndex===undefined?undefined:validIndex(raw.sceneIndex,p);
      const frameLabReferenceProjectId=p.motionV2?.enabled?p.motionV2.frameLabProjectId??null:null;
      if(frameLabReferenceProjectId){
        const {statusOf}=await import("../frame-lab/handler.mjs");
        const ref=await statusOf(frameLabReferenceProjectId);
        if(!ref.hasReference)throw Object.assign(new Error("O Frame Lab ainda não tem o vídeo original desta referência."),{status:422});
      }
      const previewReview=await requireApprovedEditorPreview(p);
      const files=await buildEditorRenderFiles(p,{sceneIndex});
      if(sceneIndex===undefined)for(const a of p.audio){
        const bytes=await readFile(audioPath(p.id,a.assetId,a.extension));
        files.push({path:"assets/audio/"+a.assetId+"."+a.extension,contentBase64:bytes.toString("base64")});
      }
      const duration=sceneIndex===undefined?p.totalFrames/p.fps:(p.scenes[sceneIndex].endFrame-p.scenes[sceneIndex].startFrame)/p.fps;
      const job=await createJob({
        prompt:p.idea.slice(0,400),project:{
          title:p.title+(sceneIndex===undefined?"":" / Cena "+(sceneIndex+1)),
          durationSeconds:duration,aspectRatio:p.aspectRatio,outputs:["video"],renderer:"hyperframes",
          fps:p.fps,preflight:raw.preflight!==false,quality:sceneIndex===undefined?"high":"draft",
          resolution:p.aspectRatio==="9:16"?"portrait":p.aspectRatio==="16:9"?"landscape":"square"
        },
        projectFiles:files,
        metadata:{source:"mediaforge-visual-editor",mode:"controlled-test",
          editorProjectId:p.id,editorSceneIndex:sceneIndex??null,expectsAudio:sceneIndex===undefined&&p.audio.length>0,
          productionMode:"cinematic-3d",artisticQA:"pending-user-review",
          previewReviewRevision:previewReview.revision,previewReviewStatus:previewReview.status,
          frameLabReferenceProjectId}
      });
      json(response,202,{ok:true,jobId:job.id,status:job.status,message:"Render enviado ao HyperFrames; o projeto editável foi preservado."});
      return true;
    }
    if(pieces.length===5&&pieces[4]==="jobs"&&request.method==="GET"){
      json(response,404,{error:"USE_GLOBAL_JOB_ROUTE"});return true;
    }
    if(pieces.length===3&&pieces[2]==="jobs"&&request.method==="GET"){
      json(response,404,{error:"JOB_ID_REQUIRED"});return true;
    }
    json(response,404,{error:"NOT_FOUND"});return true;
  }catch(error){
    json(response,error.status||400,{ok:false,error:error.code||"EDITOR_ERROR",message:error.message||"Falha de edição."});return true;
  }
}
export async function handleEditorJobStatus({request,response,url,isAdminSession,getJob}){
  const m=/^\/api\/editor\/jobs\/([a-f0-9]{32})$/.exec(url.pathname);
  if(!m)return false;
  if(!(await isAdminSession(request))){json(response,401,{error:"AUTH_REQUIRED"});return true;}
  const job=await getJob(m[1]);
  if(!job||job.metadata?.source!=="mediaforge-visual-editor"){json(response,404,{error:"NOT_FOUND"});return true;}
  json(response,200,{ok:true,status:job.status,progress:job.progress,error:job.error||null,
    artifact:job.status==="completed"?await signedVideoDownload(job):null,
    motionQA:{status:job.metadata?.motionV2FrameLabStatus??(job.metadata?.frameLabReferenceProjectId?"waiting":"not-configured"),
      comparisonProjectId:job.metadata?.motionV2FrameLabProjectId??null,
      referenceProjectId:job.metadata?.frameLabReferenceProjectId??null,
      url:job.metadata?.motionV2FrameLabProjectId?"/frame-lab":null}});
  return true;
}

/** Authenticated, same-origin operator controls for the shared Windows queue.
 * Keeps cancelled job records and every project asset on disk. */
export async function handleEditorQueueManagementHttp({request,response,url,isAdminSession,listJobs,cancelJob}){
  const queue=url.pathname==="/api/editor/queue";
  const cancel=/^\/api\/editor\/queue\/([a-f0-9]{32})\/cancel$/.exec(url.pathname);
  if(!queue&&!cancel)return false;
  if(!(await isAdminSession(request))){json(response,401,{ok:false,error:"AUTH_REQUIRED"});return true;}
  try{
    if(queue&&request.method==="GET"){
      const jobs=(await listJobs(150)).filter(x=>["queued","processing","cancelled","completed","failed"].includes(x.status));
      json(response,200,{ok:true,jobs:jobs.map(x=>({
        id:x.id,title:x.project?.title||"Sem titulo",status:x.status,
        progress:x.progress||0,phase:x.phase||null,message:x.progressMessage||null,
        createdAt:x.createdAt,updatedAt:x.updatedAt,cancelRequestedAt:x.cancelRequestedAt||null,
        framesCompleted:x.renderTelemetry?.framesCompleted??null,
        totalFrames:x.renderTelemetry?.totalFrames??null,
        resolution:x.project?.resolution||null,fps:x.project?.fps||null
      }))});return true;
    }
    if(cancel&&request.method==="POST"){
      assertSameOrigin(request);
      const job=await cancelJob(cancel[1]);
      json(response,200,{ok:true,id:job.id,status:job.status,
        cancelRequested:!!(job.cancelRequestedAt&&job.status==="processing")});return true;
    }
    json(response,405,{ok:false,error:"METHOD_NOT_ALLOWED"});return true;
  }catch(e){json(response,e.status||400,{ok:false,error:e.message||"QUEUE_ERROR"});return true;}
}
