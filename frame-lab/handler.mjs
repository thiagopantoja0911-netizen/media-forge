import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile, stat, rename, rm, access } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "@derhuerst/ffprobe-static";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { readProjectPackage } from "./project-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = resolve(process.env.FRAME_LAB_DATA_DIR || join(process.env.MEDIAFORGE_DATA_DIR || ".mediaforge", "frame-lab"));
const uploadLimit = Math.min(Number(process.env.FRAME_LAB_UPLOAD_LIMIT_BYTES || 120 * 1024 * 1024), 300 * 1024 * 1024);
const ffmpegBin=ffmpegStatic?.default||ffmpegStatic;
const ffprobeBin=ffprobeStatic?.path||ffprobeStatic?.default?.path||ffprobeStatic;
const analyzer = join(here, "analyze-node.mjs");
const running = new Map();
const ID = /^[a-f0-9]{32}$/;
const KINDS = new Set(["reference", "render"]);
const IMAGES = new Set(["reference", "render", "diff", "flow"]);

await mkdir(dataRoot, { recursive: true, mode: 0o700 });

function statusError(message, status=400) {
  return Object.assign(new Error(message), { status });
}
function safeDir(id) {
  if (!ID.test(String(id))) throw statusError("Invalid project id", 404);
  return join(dataRoot, id);
}
function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}
function html(response, text) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8", "cache-control":"no-store",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  });
  response.end(text);
}
async function bodyJson(request, max=65536) {
  let size=0, parts=[];
  for await (const chunk of request) {
    size+=chunk.length;
    if (size>max) throw statusError("JSON body too large",413);
    parts.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(parts).toString("utf8") || "{}");}
  catch {throw statusError("Invalid JSON");}
}
async function readJson(path, fallback=null) {
  try {return JSON.parse(await readFile(path,"utf8"));}
  catch (e) {if(e.code==="ENOENT")return fallback;throw e;}
}
async function writeJson(path, value) {
  const tmp=path+"."+randomBytes(4).toString("hex")+".tmp";
  await writeFile(tmp,JSON.stringify(value),{mode:0o600});
  await rename(tmp,path);
}
async function fileExists(path) {
  try {await access(path);return true;}catch{return false;}
}
async function statusOf(id) {
  const dir=safeDir(id);
  if (!(await fileExists(dir))) throw statusError("Project not found",404);
  const progress=await readJson(join(dir,"results","progress.json"),{status:"waiting"});
  const hasRef=await fileExists(join(dir,"reference.mp4"));
  const hasRender=await fileExists(join(dir,"render.mp4"));
  const hasProject=await fileExists(join(dir,"project.zip"));
  const report=await readJson(join(dir,"results","report.json"),null);
  return {id,hasReference:hasRef,hasProject,hasRender,hasReport:Boolean(report),
    running:running.has(id),progress,
    referenceFrames:report?.reference?.frameCount||0,
    renderedFrames:report?.render?.frameCount||0};
}
async function capabilities() {
  const probe=spawnSync(ffprobeBin,["-version"],{encoding:"utf8",timeout:3000});
  const cvPresent=existsSync(join(here,"node_modules","@techstark","opencv-js")) || existsSync(join(here,"..","node_modules","@techstark","opencv-js"));
  return {ffprobe:probe.status===0,opencv:cvPresent,
    engineReady:probe.status===0&&cvPresent&&existsSync(ffmpegBin),
    engine:"OpenCV WebAssembly (Node 22)",cvVersion:cvPresent?"5.0.0-WASM":null,
    noTemporalSampling:true,sourceResolution:true,subpixelEstimated:true,
    server:"Frame Lab — isolated from MediaForge production jobs"};
}
async function receiveFile(request, file) {
  const size=Number(request.headers["content-length"]||0);
  if (size>uploadLimit) throw statusError("Video exceeds upload limit",413);
  const temp=file+".upload-"+randomBytes(8).toString("hex");
  let seen=0;
  const meter=new Transform({transform(chunk,encoding,callback) {
    seen+=chunk.length;
    if(seen>uploadLimit) callback(statusError("Video exceeds upload limit",413));
    else callback(null,chunk);
  }});
  try{
    await pipeline(request,meter,createWriteStream(temp,{flags:"wx",mode:0o600}));
    if(seen<128) throw statusError("Upload is empty or incomplete");
    await rename(temp,file);
    return seen;
  }finally{
    await rm(temp,{force:true}).catch(()=>{});
  }
}
async function startAnalysis(id) {
  const dir=safeDir(id);
  if (running.size>0) throw statusError("Another full-frame analysis is running",409);
  if (!(await fileExists(join(dir,"reference.mp4")))) throw statusError("Reference video missing");
  const resultDir=join(dir,"results");
  await rm(resultDir,{recursive:true,force:true});
  await mkdir(resultDir,{recursive:true});
  await writeJson(join(resultDir,"progress.json"),{status:"queued"});
  const args=[analyzer,"--reference",join(dir,"reference.mp4"),"--output",resultDir];
  if(await fileExists(join(dir,"render.mp4")))args.push("--render",join(dir,"render.mp4"));
  const child=spawn(process.execPath,args,{
    cwd:dir,stdio:["ignore","pipe","pipe"],
    env:{...process.env,OMP_NUM_THREADS:"1",OPENBLAS_NUM_THREADS:"1",PYTHONUNBUFFERED:"1"}
  });
  let message="", closed=false;
  running.set(id,child);
  const collect=(chunk)=>{message=(message+String(chunk)).slice(-4000);};
  child.stdout.on("data",collect);
  child.stderr.on("data",collect);
  child.on("error",async error=>{
    if(closed)return;closed=true;running.delete(id);
    await writeJson(join(resultDir,"progress.json"),{status:"failed",error:String(error.message).slice(0,300)});
  });
  child.on("close",async code=>{
    if(closed)return;closed=true;running.delete(id);
    const current=await readJson(join(resultDir,"progress.json"),null);
    if(code!==0 && current?.status!=="failed") {
      await writeJson(join(resultDir,"progress.json"),{status:"failed",
        error:"Analyzer exited with "+code+": "+message.slice(-300)});
    }
  });
  return {id,status:"queued"};
}
async function serveFrame(response,id,kind,index) {
  if(!IMAGES.has(kind)|| !/^\d{1,6}$/.test(String(index))) throw statusError("Invalid frame path",404);
  const file=join(safeDir(id),"results","frames_"+kind,String(index).padStart(6,"0")+".webp");
  let meta;
  try {meta=await stat(file);}catch {throw statusError("Frame not found",404);}
  if(!meta.isFile())throw statusError("Frame not found",404);
  response.writeHead(200,{"content-type":"image/webp","content-length":meta.size,
    "cache-control":"private, max-age=60","x-content-type-options":"nosniff"});
  createReadStream(file).pipe(response);
}
// MCP actions share these tested Frame Lab primitives and storage.
export { dataRoot, safeDir, readJson, writeJson, fileExists, statusOf, capabilities, startAnalysis };
export async function handleFrameLab({request,response,url,isAdminSession,createJob,getJob,getWorkerStatus}){
  const fullPath=url.pathname;
  if(!(fullPath==="/frame-lab" || fullPath.startsWith("/frame-lab/"))) return false;
  const path=fullPath.slice("/frame-lab".length)||"/";
  // Reuse the MediaForge admin cookie. No second password/key and no anonymous frame access.
  if(!(await isAdminSession(request))){
    if(request.method==="GET" && (path==="/" || path==="/index.html")){
      response.writeHead(302,{"location":"/dashboard","cache-control":"no-store"});
      response.end();
    } else json(response,401,{ok:false,error:"AUTH_REQUIRED"});
    return true;
  }
  // Same-origin mutations prevent the signed-in browser from accepting cross-site uploads.
  if(!["GET","HEAD","OPTIONS"].includes(request.method)&&request.headers.origin){
    let originHost="";
    try{originHost=new URL(String(request.headers.origin)).host}catch{}
    const validHosts=[request.headers.host,request.headers["x-forwarded-host"]].filter(Boolean);
    if(!validHosts.includes(originHost)){
      json(response,403,{error:"CROSS_ORIGIN_MUTATION_REJECTED"});return true;
    }
  }
  try {
    if(request.method==="GET" && (path==="/"||path==="/frame-lab")) {
      return html(response,await readFile(join(here,"public","index.html"),"utf8"));
    }
    if(request.method==="GET" && path==="/quick-flow.js") {
      response.writeHead(200,{"content-type":"text/javascript; charset=utf-8",
        "cache-control":"no-store","x-content-type-options":"nosniff"});
      response.end(await readFile(join(here,"public","quick-flow.js"),"utf8"));
      return;
    }
    if(request.method==="GET" && path==="/health") {
      return json(response,200,{ok:true,service:"frame-lab",running:running.size});
    }
    if(!path.startsWith("/api/"))return json(response,404,{error:"Not found"});
    if(path==="/api/capabilities" && request.method==="GET")
      return json(response,200,await capabilities());
    if(path==="/api/worker-status" && request.method==="GET") {
      if(typeof getWorkerStatus!=="function")throw statusError("Worker status unavailable",503);
      return json(response,200,await getWorkerStatus());
    }
    if(path==="/api/projects" && request.method==="GET") {
      const ids=(await readdir(dataRoot)).filter(id=>ID.test(id)).slice(-100).reverse();
      const projects=[];
      for(const id of ids){try{projects.push(await statusOf(id));}catch{}}
      return json(response,200,{projects});
    }
    if(path==="/api/projects" && request.method==="POST") {
      const id=randomBytes(16).toString("hex");
      await mkdir(safeDir(id),{recursive:false,mode:0o700});
      await writeJson(join(safeDir(id),"objects.json"),{objects:[]});
      return json(response,201,{id});
    }
    const match=path.match(/^\/api\/projects\/([a-f0-9]{32})(?:\/(.*))?$/);
    if(!match)return json(response,404,{error:"Unknown API route"});
    const [_,id,tail=""]=match,dir=safeDir(id);
    if(!(await fileExists(dir)))throw statusError("Project not found",404);
    if(!tail&&request.method==="GET")return json(response,200,await statusOf(id));
    if(tail==="analyze"&&request.method==="POST"){
      return json(response,202,await startAnalysis(id));
    }
    if(tail==="status"&&request.method==="GET")return json(response,200,await statusOf(id));
    if(tail==="render-job"&&request.method==="GET"){
      const queued=await readJson(join(dir,"render-job.json"),null);
      if(!queued)return json(response,200,{ok:true,renderJob:null});
      const job=typeof getJob==="function"?await getJob(queued.jobId):null;
      return json(response,200,{ok:true,renderJob:job?{
        id:job.id,status:job.status,progress:job.progress,
        error:job.error||null,result:job.result?{
          fileName:job.result.fileName,report:job.result.report||null,
          artifactUploaded:job.result.artifactUploaded===true
        }:null
      }:{id:queued.jobId,status:"unknown"}});
    }
    if(tail==="render-job"&&request.method==="POST"){
      if(typeof createJob!=="function")throw statusError("MediaForge render queue unavailable",503);
      const report=await readJson(join(dir,"results","report.json"),null);
      if(!report)throw statusError("Analyze the source before rendering",409);
      const zip=join(dir,"project.zip");
      if(!(await fileExists(zip)))throw statusError("Upload an editable reconstruction ZIP first",409);
      const previous=await readJson(join(dir,"render-job.json"),null);
      if(previous && typeof getJob==="function"){
        const job=await getJob(previous.jobId);
        if(job&&["queued","processing"].includes(job.status))throw statusError("Previous render still active",409);
      }
      const archive=await readProjectPackage(zip);
      const settings=await bodyJson(request,8192);
      if(settings.confirmRender!==true)throw statusError("Explicit render confirmation required",428);
      const w=report.reference.width,h=report.reference.height;
      const aspectRatio=Math.abs(w/h-9/16)<.04?"9:16":Math.abs(w/h-16/9)<.04?"16:9":
        Math.abs(w/h-1)<.04?"1:1":null;
      if(!aspectRatio)throw statusError("Source aspect ratio is not yet supported by renderer",422);
      const fps=Math.min(120,Math.max(1,Math.round(report.reference.fps||30)));
      const quality=["draft","looks","standard","high","delivery"].includes(settings.quality)?
        settings.quality:"standard";
      const job=await createJob({
        prompt:"Frame Lab frame-accurate editable reconstruction "+id,
        project:{title:"Frame Lab — "+id.slice(0,9),durationSeconds:report.reference.duration_s,
          aspectRatio,outputs:["video"],renderer:"hyperframes",fps,
          quality,resolution:aspectRatio==="9:16"?"portrait":"landscape",
          workers:1,preflight:true},
        projectFiles:archive.projectFiles,
        metadata:{source:"frame-lab",frameLabProjectId:id,mode:"reconstruction",
          expectsAudio:archive.projectFiles.some(f=>f.path.match(/\.(?:m4a|mp3|wav)$/i)),
          qaStatus:"pending-reference-comparison"}
      });
      await writeJson(join(dir,"render-job.json"),{jobId:job.id,createdAt:new Date().toISOString()});
      return json(response,202,{ok:true,jobId:job.id,status:job.status,
        workflow:"analysis → authored project → MediaForge worker → artifact upload → frame comparison"});
    }
    if(tail==="compare"&&request.method==="POST"){
      if(!(await fileExists(join(dir,"render.mp4"))))throw statusError("Rendered MP4 not received",409);
      return json(response,202,await startAnalysis(id));
    }
    if(tail==="video/render"&&request.method==="GET"){
      const file=join(dir,"render.mp4");
      const details=await stat(file).catch(()=>null);
      if(!details?.isFile())throw statusError("Rendered file not yet available",404);
      response.writeHead(200,{"content-type":"video/mp4","content-length":details.size,
        "cache-control":"private, no-store","content-disposition":'attachment; filename="frame-lab-render.mp4"'});
      return createReadStream(file).pipe(response);
    }
    if(tail==="objects"&&request.method==="GET"){
      return json(response,200,await readJson(join(dir,"objects.json"),{objects:[]}));
    }
    if(tail==="objects"&&request.method==="POST"){
      if(running.has(id))throw statusError("Analysis running",409);
      const payload=await bodyJson(request);
      if(!Array.isArray(payload.objects)||payload.objects.length>40)
        throw statusError("Invalid object list (maximum 40)");
      const objects=payload.objects.map((o,i)=>{
        if(typeof o!=="object"||!o)throw statusError("Invalid object");
        for(const key of ["x","y","w","h"]){
          if(typeof o[key]!=="number"||!Number.isFinite(o[key])||o[key]<0)
            throw statusError("Invalid ROI coordinate");
        }
        if(o.w<2||o.h<2)throw statusError("ROI too small");
        return {id:String(o.id??i).slice(0,60),label:String(o.label??"Objeto "+(i+1)).slice(0,100),
          x:o.x,y:o.y,w:o.w,h:o.h,startFrame:Math.max(0,Math.floor(o.startFrame||0))};
      });
      await writeJson(join(dir,"objects.json"),{objects});
      return json(response,200,{ok:true,objects});
    }
    if(tail==="report"&&request.method==="GET"){
      const report=await readJson(join(dir,"results","report.json"),null);
      if(!report)throw statusError("Report not ready",404);
      return json(response,200,report);
    }
    if(tail.startsWith("frames/")&&request.method==="GET"){
      const seg=tail.split("/");
      if(seg.length!==3)throw statusError("Invalid frame path",404);
      return serveFrame(response,id,seg[1],seg[2]);
    }
    if(tail.startsWith("upload/")&&request.method==="POST"){
      const kind=tail.split("/")[1];
      if(kind!=="project"&&!KINDS.has(kind))throw statusError("Invalid upload type",404);
      if(running.has(id))throw statusError("Analysis in progress",409);
      const job=await readJson(join(dir,"render-job.json"),null);
      if(job && typeof getJob==="function"){
        const current=await getJob(job.jobId);
        if(current&&["queued","processing"].includes(current.status))
          throw statusError("Cannot replace project or videos while rendering",409);
      }
      const file=join(dir,kind==="project"?"project.zip":kind+".mp4");
      const bytes=await receiveFile(request,file);
      if(kind==="project"){
        try{await readProjectPackage(file)}
        catch(e){await rm(file,{force:true});throw e}
      }
      return json(response,201,{ok:true,kind,bytes});
    }
    return json(response,404,{error:"Unknown route"});
  } catch(error){
    if(response.headersSent){response.destroy();return;}
    json(response,error.status||500,{error:error.status?error.message:"Request failed",
        detail:process.env.NODE_ENV==="production"?undefined:String(error.message)});
  }
}
