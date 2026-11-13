import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { readdir, readFile, writeFile, rename, stat, mkdir, rm } from "node:fs/promises";
import { join, resolve, relative, sep } from "node:path";
import { readState, updateState, verifySecret } from "./state-store.mjs";

const HEX_ID = /^[a-f0-9]{32}$/;
const LEASE_MS = 120_000;

function reply(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
function safeFile(path) {
  return typeof path === "string" && path.length > 0 && !/^[A-Za-z]:/.test(path)
    && !path.startsWith("\\") && !path.startsWith("/")
    && !path.includes("\0") && !path.split(/[\\/]/).includes("..");
}
function contained(root, target) {
  const rel = relative(root, target);
  return rel && rel !== ".." && !rel.startsWith(".." + sep) && !/^([\\/]|[A-Za-z]:)/.test(rel);
}
function tokenMatches(a,b) {
  if (!a || !b) return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
async function authenticated(request) {
  const token=String(request.headers.authorization||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";
  if (!token) return false;
  const state=await readState();
  return verifySecret(token,state.settings.workerTokenHash)
    || tokenMatches(token,process.env.MEDIAFORGE_WORKER_TOKEN);
}
async function saveJob(jobsDir,job) {
  job.updatedAt=new Date().toISOString();
  const path=join(jobsDir,job.id+".json");
  const temp=path+"."+randomUUID()+".tmp";
  await writeFile(temp,JSON.stringify(job,null,2)+"\n",{mode:0o600});
  await rename(temp,path);
}
async function loadJob(jobsDir,id) {
  if (!HEX_ID.test(id)) return null;
  try{return JSON.parse(await readFile(join(jobsDir,id+".json"),"utf8"));}
  catch(e){if(e.code==="ENOENT")return null;throw e;}
}
async function parseBody(request,max=65_536) {
  let size=0;const chunks=[];
  for await (const chunk of request) {
    size+=chunk.length;if(size>max)throw Object.assign(new Error("request too large"),{status:413});
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}
async function allFiles(root,sub="") {
  const files=[];
  for(const entry of await readdir(join(root,sub),{withFileTypes:true})) {
    if(entry.isSymbolicLink())throw new Error("Project symlinks are not supported");
    const path=sub?sub+"/"+entry.name:entry.name;
    if(!safeFile(path))throw new Error("Unsafe path in stored project");
    if(entry.isDirectory())files.push(...await allFiles(root,path));
    else if(entry.isFile())files.push(path);
  }
  return files;
}
function validLease(job, leaseId) {
  return job && job.status==="processing" && typeof leaseId==="string"
    && job.workerLease?.id===leaseId && Date.parse(job.workerLease.expiresAt)>Date.now();
}
export async function handleRemoteWorker({request,response,url,jobsDir,projectsRoot,workerStatusFile}) {
  if(!url.pathname.startsWith("/v1/worker/"))return false;
  if(!(await authenticated(request))) {reply(response,401,{ok:false,error:"WORKER_UNAUTHORIZED"});return true;}
  const path=url.pathname;
  try {
    if(request.method==="POST"&&path==="/v1/worker/heartbeat") {
      const body=await parseBody(request);
      const workerId=String(body.workerId||"").slice(0,100);
      if(!workerId)throw new Error("workerId required");
      const state={workerId,renderer:String(body.renderer||"hyperframes"),lastSeen:new Date().toISOString()};
      await writeFile(workerStatusFile,JSON.stringify(state)+"\n");
      if(HEX_ID.test(body.jobId||"")&&body.leaseId){
        await updateState(async()=> {
          const job=await loadJob(jobsDir,body.jobId);
          if(job&&job.status==="processing"&&job.workerLease?.id===body.leaseId&&job.workerLease.workerId===workerId){
            job.workerLease.expiresAt=new Date(Date.now()+LEASE_MS).toISOString();
            await saveJob(jobsDir,job);
          }
        });
      }
      reply(response,200,{ok:true,serverTime:new Date().toISOString()});return true;
    }
    if(request.method==="POST"&&path==="/v1/worker/claim") {
      const body=await parseBody(request);
      const workerId=String(body.workerId||"").slice(0,100);
      if(!workerId)throw new Error("workerId required");
      const job=await updateState(async()=>{
        const names=(await readdir(jobsDir)).filter(x=>HEX_ID.test(x.slice(0,-5))&&x.endsWith(".json")).sort();
        for(const filename of names) {
          const id=filename.slice(0,-5);
          const j=await loadJob(jobsDir,id);
          if(!j)continue;
          if(j.status==="processing"&&j.workerLease&&Date.parse(j.workerLease.expiresAt)<Date.now()){
            if((j.attempts||0)<3){j.status="queued";delete j.workerLease;await saveJob(jobsDir,j);}
            else {j.status="failed";j.error={message:"Worker lease expired after retries",code:"WORKER_TIMEOUT"};delete j.workerLease;await saveJob(jobsDir,j);}
          }
          if(j.status!=="queued" || (j.nextAttemptAt&&Date.parse(j.nextAttemptAt)>Date.now()))continue;
          if(!j.project?.inlineFiles){j.status="failed";j.error={code:"REMOTE_FILES_REQUIRED",message:"Remote worker requires inline project files"};await saveJob(jobsDir,j);continue;}
          j.status="processing";j.progress=10;j.attempts=(j.attempts||0)+1;
          j.workerLease={id:randomUUID(),workerId,expiresAt:new Date(Date.now()+LEASE_MS).toISOString()};
          await saveJob(jobsDir,j);return j;
        }
        return null;
      });
      reply(response,200,{ok:true,job:job?{...job,workerLease:undefined}:null,leaseId:job?.workerLease?.id||null});return true;
    }
    const match=/^\/v1\/worker\/jobs\/([a-f0-9]{32})\/(project|progress|complete|artifact)$/.exec(path);
    if(match) {
      const id=match[1],action=match[2];
      if(action==="project"&&request.method==="GET"){
        const leaseId=String(request.headers["x-mediaforge-lease"]||"");
        const job=await loadJob(jobsDir,id);
        if(!validLease(job,leaseId)) {reply(response,409,{ok:false,error:"LEASE_INVALID"});return true;}
        const root=resolve(projectsRoot,id);
        const paths=await allFiles(root);
        if(paths.length>80)throw new Error("Project file count exceeds limit");
        let total=0;
        const files=[];
        for(const path of paths){
          const full=resolve(root,path);
          if(!contained(root,full))throw new Error("Project escapes storage root");
          const data=await readFile(full);total+=data.length;
          if(total>24*1024*1024)throw new Error("Project exceeds transfer limit");
          files.push({path,contentBase64:data.toString("base64"),sha256:createHash("sha256").update(data).digest("hex")});
        }
        reply(response,200,{ok:true,files});return true;
      }
      if(action==="artifact"&&request.method==="POST"){
        const leaseId=String(request.headers["x-mediaforge-lease"]||"");
        const job=await loadJob(jobsDir,id);
        if(!validLease(job,leaseId)){reply(response,409,{ok:false,error:"LEASE_INVALID"});return true;}
        if(job.metadata?.source!=="frame-lab"||!HEX_ID.test(job.metadata.frameLabProjectId||"")){
          reply(response,403,{ok:false,error:"NOT_FRAME_LAB_JOB"});return true;
        }
        const projectId=job.metadata.frameLabProjectId;
        const labRoot=resolve(process.env.FRAME_LAB_DATA_DIR ||
          join(process.env.MEDIAFORGE_DATA_DIR||".mediaforge","frame-lab"));
        const dir=resolve(labRoot,projectId);
        const existing=await stat(dir).catch(()=>null);
        if(!existing?.isDirectory())throw Object.assign(new Error("Frame Lab project missing"),{status:404});
        const maxBytes=120*1024*1024;
        const expectedSize=Number(request.headers["content-length"]);
        if(!Number.isSafeInteger(expectedSize)||expectedSize<128||expectedSize>maxBytes)
          throw Object.assign(new Error("Artifact content-length required (max 120MB)"),{status:413});
        const target=join(dir,"render.mp4"),tmp=target+".upload-"+randomUUID();
        const hash=createHash("sha256");let size=0;
        const meter=new Transform({transform(chunk,enc,next){
          size+=chunk.length;
          if(size>maxBytes)next(Object.assign(new Error("Artifact too large"),{status:413}));
          else{hash.update(chunk);next(null,chunk);}
        }});
        try {
          await pipeline(request,meter,createWriteStream(tmp,{flags:"wx",mode:0o600}));
          if(size!==expectedSize)throw new Error("Artifact upload incomplete");
          const digest=hash.digest("hex");
          const expectedSha=String(request.headers["x-mediaforge-artifact-sha256"]||"").toLowerCase();
          if(!/^[0-9a-f]{64}$/.test(expectedSha)||digest!==expectedSha)
            throw new Error("Artifact checksum mismatch");
          await rename(tmp,target);
          // The artifact originated from a signed Windows worker lease. Start the
          // all-frame comparison on the server without requiring another UI click.
          // If the analyzer is busy, preserve the artifact and allow safe retry.
          try {
            const { startAnalysis } = await import("../frame-lab/handler.mjs");
            await startAnalysis(projectId);
          } catch (e) {
            console.error("Frame Lab automatic compare deferred:",e.message);
          }
          reply(response,200,{ok:true,id,frameLabProjectId:projectId,size,sha256:digest});
        }finally{await rm(tmp,{force:true}).catch(()=>{});}
        return true;
      }
      if(action==="progress"&&request.method==="POST"){
        const body=await parseBody(request,100_000);
        const result=await updateState(async()=>{
          const job=await loadJob(jobsDir,id);
          if(!validLease(job,body.leaseId))return null;
          const progress=Number(body.progress);
          job.progress=Number.isFinite(progress)
            ?Math.max(0,Math.min(99,Math.floor(progress))):job.progress;
          job.progressMessage=String(body.message||"Renderizando").replace(/[\r\n]+/g," ").slice(0,255);
          await saveJob(jobsDir,job);
          return job;
        });
        if(!result){reply(response,409,{ok:false,error:"LEASE_INVALID"});return true;}
        reply(response,200,{ok:true,id,progress:result.progress,message:result.progressMessage});return true;
      }
      if(action==="complete"&&request.method==="POST"){
        const body=await parseBody(request,100_000);
        const result=await updateState(async()=>{
          const job=await loadJob(jobsDir,id);
          if(!validLease(job,body.leaseId))return null;
          job.status=body.success===true?"completed":"failed";
          job.progress=body.success===true?100:0;
          if(body.success===true){
            job.result={mode:"hyperframes-cli",fileName:String(body.fileName||"").slice(0,240),
              size:Number(body.size)||0,sha256:String(body.sha256||"").slice(0,64),
              outputPath:String(body.outputPath||"").slice(0,900),report:body.report||null,
              workerId:job.workerLease.workerId,
              location:body.artifactUploaded===true?"frame-lab-hostinger":"windows-local",
              artifactUploaded:body.artifactUploaded===true};
            delete job.error;
          }else{
            job.error={code:"REMOTE_RENDER_FAILED",message:String(body.error||"Render failed").slice(0,15000)};
          }
          delete job.workerLease;await saveJob(jobsDir,job);return job;
        });
        if(!result){reply(response,409,{ok:false,error:"LEASE_INVALID"});return true;}
        reply(response,200,{ok:true,id,status:result.status});return true;
      }
    }
    reply(response,404,{ok:false,error:"NOT_FOUND"});return true;
  }catch(error){reply(response,error.status||400,{ok:false,error:error.message});return true;}
}
