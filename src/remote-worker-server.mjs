import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { readdir, readFile, writeFile, rename, stat, mkdir, rm, cp } from "node:fs/promises";
import { isRecoverableRenderFailure } from "./render-recovery.mjs";
import {orderQueuedJobs,applyWorkerProgress} from "./render-watchdog.mjs";
import {requestCancellation,reconcileExpiredLease,acknowledgeCancellation,cancellationRequested} from "./job-cancellation.mjs";
import { join, resolve, relative, sep } from "node:path";
import { readState, updateState, verifySecret } from "./state-store.mjs";
import {deliveredVideoRoot,deliveredVideoPath,MAX_DELIVERED_VIDEO_BYTES} from "./video-artifact-delivery.mjs";
import { createMotionV2Comparison } from "./editor-frame-lab-bridge.mjs";

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
export async function requestCancelJob(jobsDir,id){
  if(!HEX_ID.test(id))throw Object.assign(new Error("INVALID_JOB_ID"),{status:422});
  return updateState(async()=>{
    const job=await loadJob(jobsDir,id);
    const result=requestCancellation(job);
    if(result.changed)await saveJob(jobsDir,job);
    return job;
  });
}

export async function handleRemoteWorker({request,response,url,jobsDir,projectsRoot,workerStatusFile}) {
  if(!url.pathname.startsWith("/v1/worker/"))return false;
  if(!(await authenticated(request))) {reply(response,401,{ok:false,error:"WORKER_UNAUTHORIZED"});return true;}
  const path=url.pathname;
  try {
    if(request.method==="POST"&&path==="/v1/worker/auth-check") {
      reply(response,200,{ok:true,authenticated:true});return true;
    }
    if(request.method==="POST"&&path==="/v1/worker/heartbeat") {
      const body=await parseBody(request);
      const workerId=String(body.workerId||"").slice(0,100);
      if(!workerId)throw new Error("workerId required");
      const state={workerId,renderer:String(body.renderer||"hyperframes"),lastSeen:new Date().toISOString()};
      await writeFile(workerStatusFile,JSON.stringify(state)+"\n");
      let mustCancel=false;
      let currentLeaseRenewed=false;
      await updateState(async()=>{
        // Refresh this live lease first; it must not be reclaimed by the same tick.
        if(HEX_ID.test(body.jobId||"")&&body.leaseId){
          const job=await loadJob(jobsDir,body.jobId);
          if(job&&job.status==="processing"&&job.workerLease?.id===body.leaseId&&
             job.workerLease.workerId===workerId&&Date.parse(job.workerLease.expiresAt)>Date.now()){
            job.workerLease.expiresAt=new Date(Date.now()+LEASE_MS).toISOString();
            mustCancel=cancellationRequested(job,body.leaseId);
            currentLeaseRenewed=true;
            await saveJob(jobsDir,job);
          }
        }
        const names=(await readdir(jobsDir)).filter(x=>HEX_ID.test(x.slice(0,-5))&&x.endsWith(".json"));
        for(const filename of names){
          if(currentLeaseRenewed&&filename===body.jobId+".json")continue;
          const job=await loadJob(jobsDir,filename.slice(0,-5));
          if(reconcileExpiredLease(job))await saveJob(jobsDir,job);
        }
      });
      reply(response,200,{ok:true,serverTime:new Date().toISOString(),cancelRequested:mustCancel});return true;
    }
    if(request.method==="POST"&&path==="/v1/worker/claim") {
      const body=await parseBody(request);
      const workerId=String(body.workerId||"").slice(0,100);
      if(!workerId)throw new Error("workerId required");
      const job=await updateState(async()=>{
        const names=(await readdir(jobsDir)).filter(x=>HEX_ID.test(x.slice(0,-5))&&x.endsWith(".json"));
        const candidates=[];
        for(const filename of names){
          const j=await loadJob(jobsDir,filename.slice(0,-5));
          if(j)candidates.push(j);
        }
        // FIFO by createdAt. Hexadecimal job ids are random, not a valid queue order.
        const ordered=orderQueuedJobs(candidates);
        for(const j of ordered) {
          if(!j)continue;
          if(reconcileExpiredLease(j))await saveJob(jobsDir,j);
          if(j.status!=="queued" || (j.nextAttemptAt&&Date.parse(j.nextAttemptAt)>Date.now()))continue;
          if(!j.project?.inlineFiles){j.status="failed";j.error={code:"REMOTE_FILES_REQUIRED",message:"Remote worker requires inline project files"};await saveJob(jobsDir,j);continue;}
          j.status="processing";j.progress=10;j.attempts=(j.attempts||0)+1;
          j.progressMessage="Job aceito no Windows; aguardando início do render";
          j.updatedAt=new Date().toISOString();
          j.workerLease={id:randomUUID(),workerId,expiresAt:new Date(Date.now()+LEASE_MS).toISOString()};
          await saveJob(jobsDir,j);return j;
        }
        return null;
      });
      reply(response,200,{ok:true,job:job?{...job,workerLease:undefined}:null,leaseId:job?.workerLease?.id||null});return true;
    }
    const match=/^\/v1\/worker\/jobs\/([a-f0-9]{32})\/(project|progress|complete|artifact|retry)$/.exec(path);
    if(match) {
      const id=match[1],action=match[2];
      if(action==="retry"&&request.method==="POST"){
        const result=await updateState(async()=>{
          const original=await loadJob(jobsDir,id);
          if(!original)throw Object.assign(new Error("JOB_NOT_FOUND"),{status:404});
          if(original.status!=="failed")throw Object.assign(new Error("JOB_NOT_FAILED"),{status:409});

          const duplicates=[];
          for(const filename of await readdir(jobsDir)){
            if(!filename.endsWith(".json")||!HEX_ID.test(filename.slice(0,-5)))continue;
            const candidate=await loadJob(jobsDir,filename.slice(0,-5));
            if(candidate?.metadata?.retryOf===id)duplicates.push(candidate);
          }
          if(duplicates.length){
            const existing=duplicates.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
            return {alreadyRetried:true,job:existing};
          }

          const failure=original.error&&typeof original.error==="object"
            ?original.error:{message:original.error};
          if(failure.recoverable!==true&&!isRecoverableRenderFailure(failure))
            throw Object.assign(new Error("JOB_FAILURE_NOT_RETRYABLE"),{status:422});
          if(original.project?.inlineFiles!==true||original.project?.sourceDir!==id)
            throw Object.assign(new Error("JOB_PROJECT_NOT_RETRYABLE"),{status:422});

          const source=resolve(projectsRoot,id);
          const sourceInfo=await stat(source).catch(()=>null);
          if(!sourceInfo?.isDirectory())
            throw Object.assign(new Error("JOB_PROJECT_FILES_MISSING"),{status:422});

          const retryId=randomUUID().replaceAll("-","");
          const target=resolve(projectsRoot,retryId);
          try{
            await cp(source,target,{recursive:true,errorOnExist:true,force:false});
            const now=new Date().toISOString();
            const retry=JSON.parse(JSON.stringify(original));
            retry.id=retryId;
            retry.status="queued";
            retry.attempts=0;
            retry.progress=0;
            retry.createdAt=now;
            retry.updatedAt=now;
            retry.project={...retry.project,sourceDir:retryId};
            retry.metadata={
              ...(retry.metadata&&typeof retry.metadata==="object"?retry.metadata:{}),
              retryOf:id,
              retryReason:"recoverable-render-failure",
              retryRequestedAt:now
            };
            delete retry.error;
            delete retry.workerLease;
            delete retry.artifactReceived;
            delete retry.result;
            delete retry.progressMessage;
            await saveJob(jobsDir,retry);
            return {alreadyRetried:false,job:retry};
          }catch(error){
            await rm(target,{recursive:true,force:true}).catch(()=>{});
            throw error;
          }
        });
        reply(response,result.alreadyRetried?200:202,{
          ok:true,
          alreadyRetried:result.alreadyRetried,
          originalJobId:id,
          job:{id:result.job.id,status:result.job.status,title:result.job.project?.title}
        });
        return true;
      }
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
        const lab=job.metadata?.source==="frame-lab" && HEX_ID.test(job.metadata.frameLabProjectId||"");
        let target,dir;
        if(lab){
          const root=resolve(process.env.FRAME_LAB_DATA_DIR||join(process.env.MEDIAFORGE_DATA_DIR||".mediaforge","frame-lab"));
          dir=resolve(root,job.metadata.frameLabProjectId);
          const existing=await stat(dir).catch(()=>null);
          if(!existing?.isDirectory())throw Object.assign(new Error("Frame Lab project missing"),{status:404});
          target=join(dir,"render.mp4");
        }else{
          dir=deliveredVideoRoot();
          await mkdir(dir,{recursive:true,mode:0o700});
          target=deliveredVideoPath(id);
        }
        const maxBytes=lab?120*1024*1024:MAX_DELIVERED_VIDEO_BYTES;
        const expectedSize=Number(request.headers["content-length"]);
        if(!Number.isSafeInteger(expectedSize)||expectedSize<128||expectedSize>maxBytes)
          throw Object.assign(new Error("Artifact content-length invalid or exceeds limit"),{status:413});
        const expectedSha=String(request.headers["x-mediaforge-artifact-sha256"]||"").toLowerCase();
        if(!/^[a-f0-9]{64}$/.test(expectedSha))
          throw Object.assign(new Error("Artifact checksum required"),{status:422});
        const tmp=target+".upload-"+randomUUID();
        const hash=createHash("sha256");let size=0;
        const meter=new Transform({transform(chunk,enc,next){
          size+=chunk.length;
          if(size>maxBytes)next(Object.assign(new Error("Artifact too large"),{status:413}));
          else{hash.update(chunk);next(null,chunk);}
        }});
        try{
          await pipeline(request,meter,createWriteStream(tmp,{flags:"wx",mode:0o600}));
          if(size!==expectedSize)throw new Error("Artifact upload incomplete");
          const digest=hash.digest("hex");
          if(digest!==expectedSha)throw new Error("Artifact checksum mismatch");
          // Never overwrite an already delivered artifact from an earlier lease.
          const existing=await stat(target).catch(()=>null);
          if(existing)throw Object.assign(new Error("Artifact already exists"),{status:409});
          await rename(tmp,target);
          await updateState(async()=>{
            const current=await loadJob(jobsDir,id);
            if(!validLease(current,leaseId))throw Object.assign(new Error("LEASE_INVALID"),{status:409});
            current.artifactReceived={sha256:digest,size,location:lab?"frame-lab-hostinger":"mediaforge-hostinger"};
            await saveJob(jobsDir,current);
          });
          if(lab){
            try{
              const {startAnalysis}=await import("../frame-lab/handler.mjs");
              await startAnalysis(job.metadata.frameLabProjectId);
            }catch(e){console.error("Frame Lab automatic compare deferred:",e.message);}
          }
          const motionReference=job.metadata?.source==="mediaforge-visual-editor"&&
            HEX_ID.test(job.metadata?.frameLabReferenceProjectId||"")?job.metadata.frameLabReferenceProjectId:null;
          if(motionReference){
            try{
              const {startAnalysis}=await import("../frame-lab/handler.mjs");
              const qa=await createMotionV2Comparison({
                referenceProjectId:motionReference,artifactPath:target,jobId:id,startAnalysis
              });
              await updateState(async()=>{
                const current=await loadJob(jobsDir,id);
                current.metadata??={};
                current.metadata.motionV2FrameLabProjectId=qa.comparisonId;
                current.metadata.motionV2FrameLabStatus=qa.status;
                if(qa.reason)current.metadata.motionV2FrameLabReason=qa.reason;
                await saveJob(jobsDir,current);
              });
            }catch(error){
              console.error("Optional Motion V2 Frame Lab QA skipped:",String(error?.message||error));
              await updateState(async()=>{
                const current=await loadJob(jobsDir,id);
                current.metadata??={};
                current.metadata.motionV2FrameLabStatus="unavailable";
                await saveJob(jobsDir,current);
              }).catch(()=>{});
            }
          }
          reply(response,200,{ok:true,id,frameLabProjectId:lab?job.metadata.frameLabProjectId:null,size,sha256:digest,location:lab?"frame-lab-hostinger":"mediaforge-hostinger"});
        }finally{await rm(tmp,{force:true}).catch(()=>{});}
        return true;
      }
      if(action==="progress"&&request.method==="POST"){
        const body=await parseBody(request,100_000);
        const result=await updateState(async()=>{
          const job=await loadJob(jobsDir,id);
          if(!validLease(job,body.leaseId))return null;
          if(job.cancelRequestedAt)return job;
          applyWorkerProgress(job,body);
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
          if(acknowledgeCancellation(job)){
            await saveJob(jobsDir,job);
            return job;
          }
          job.status=body.success===true?"completed":"failed";
          job.progress=body.success===true?100:0;
          if(body.success===true){
            if(body.artifactUploaded===true){
              const stored=job.artifactReceived;
              if(!stored||stored.sha256!==body.sha256||stored.size!==body.size)
                throw Object.assign(new Error("ARTIFACT_RECEIPT_MISMATCH"),{status:409});
            }
            job.result={mode:"hyperframes-cli",fileName:String(body.fileName||"").slice(0,240),
              size:Number(body.size)||0,sha256:String(body.sha256||"").slice(0,64),
              outputPath:String(body.outputPath||"").slice(0,900),report:body.report||null,
              workerId:job.workerLease.workerId,
              location:body.artifactUploaded===true?(job.metadata?.source==="frame-lab"?"frame-lab-hostinger":"mediaforge-hostinger"):"windows-local",
              artifactUploaded:body.artifactUploaded===true};
            delete job.error;
          }else{
            const failure = body.error && typeof body.error === "object"
              ? body.error
              : { message: body.error };
            job.error = {
              code: String(failure.code || "REMOTE_RENDER_FAILED").slice(0, 100),
              message: String(failure.message || "Render failed").slice(0, 15000),
              recoverable: failure.recoverable === true,
              retryable: failure.retryable === true,
              retryAttempts: Number.isSafeInteger(failure.retryAttempts) ? failure.retryAttempts : null,
              attempts: job.attempts || 1,
              diagnostics: failure.diagnostics && typeof failure.diagnostics === "object"
                ? failure.diagnostics
                : null
            };
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
