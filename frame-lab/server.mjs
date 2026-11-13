import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile, stat, rename, rm, access } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = resolve(process.env.FRAME_LAB_DATA_DIR || join(here, ".frame-lab-data"));
const host = process.env.FRAME_LAB_HOST || "0.0.0.0";
const port = Number(process.env.PORT || process.env.FRAME_LAB_PORT || 8791);
const secret = String(process.env.FRAME_LAB_KEY || "");
const uploadLimit = Math.min(Number(process.env.FRAME_LAB_UPLOAD_LIMIT_BYTES || 120 * 1024 * 1024), 300 * 1024 * 1024);
const bundledPython=process.platform==="win32"?join(here,".venv","Scripts","python.exe"):join(here,".venv","bin","python");
const python = process.env.FRAME_LAB_PYTHON || (existsSync(bundledPython)?bundledPython:"python3");
const analyzer = join(here, "analyze.py");
const running = new Map();
const ID = /^[a-f0-9]{32}$/;
const KINDS = new Set(["reference", "render"]);
const IMAGES = new Set(["reference", "render", "diff", "flow"]);

if (process.env.NODE_ENV === "production" && secret.length < 24) {
  throw new Error("FRAME_LAB_KEY must have >=24 characters in production (no anonymous uploads)");
}
await mkdir(dataRoot, { recursive: true, mode: 0o700 });

function statusError(message, status=400) {
  return Object.assign(new Error(message), { status });
}
function safeDir(id) {
  if (!ID.test(String(id))) throw statusError("Invalid project id", 404);
  return join(dataRoot, id);
}
function secure(request) {
  const provided = String(request.headers["x-frame-lab-key"] || "");
  if (secret.length < 24 || provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(provided));
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
  const report=await readJson(join(dir,"results","report.json"),null);
  return {id,hasReference:hasRef,hasRender,hasReport:Boolean(report),
    running:running.has(id),progress,
    referenceFrames:report?.reference?.frameCount||0,
    renderedFrames:report?.render?.frameCount||0};
}
async function capabilities() {
  const ffmpeg=spawnSync("ffprobe",["-version"],{encoding:"utf8",timeout:3000});
  const cv=spawnSync(python,["-c","import cv2; print(cv2.__version__)"],{encoding:"utf8",timeout:5000});
  return {ffprobe:ffmpeg.status===0,opencv:cv.status===0,
    engineReady:cv.status===0,python:python,
    cvVersion:cv.status===0?cv.stdout.trim().split("\n")[0]:null,
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
  const args=["-u",analyzer,"--reference",join(dir,"reference.mp4"),"--output",resultDir];
  if(await fileExists(join(dir,"render.mp4")))args.push("--render",join(dir,"render.mp4"));
  const child=spawn(python,args,{
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
const app = createServer(async (request,response)=>{
  try {
    const url=new URL(request.url,"http://localhost");
    const path=url.pathname;
    if(request.method==="GET" && (path==="/"||path==="/frame-lab")) {
      return html(response,await readFile(join(here,"public","index.html"),"utf8"));
    }
    if(request.method==="GET" && path==="/health") {
      return json(response,200,{ok:true,service:"frame-lab",running:running.size});
    }
    if(path==="/api/auth" && request.method==="POST") {
      const provided=(await bodyJson(request,2048)).key;
      const ok=secure({headers:{"x-frame-lab-key":provided}});
      return json(response,ok?200:401,{ok});
    }
    if(!path.startsWith("/api/"))return json(response,404,{error:"Not found"});
    if(!secure(request))return json(response,401,{error:"Authentication required"});
    if(path==="/api/capabilities" && request.method==="GET")
      return json(response,200,await capabilities());
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
      if(!KINDS.has(kind))throw statusError("Invalid upload type",404);
      if(running.has(id))throw statusError("Analysis in progress",409);
      const bytes=await receiveFile(request,join(dir,kind+".mp4"));
      return json(response,201,{ok:true,kind,bytes});
    }
    return json(response,404,{error:"Unknown route"});
  } catch(error){
    if(response.headersSent){response.destroy();return;}
    json(response,error.status||500,{error:error.status?error.message:"Request failed",
        detail:process.env.NODE_ENV==="production"?undefined:String(error.message)});
  }
});
app.listen(port,host,()=>console.log("Frame Lab listening on "+host+":"+port));
