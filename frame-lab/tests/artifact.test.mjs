import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const tmp=await mkdtemp(join(tmpdir(),"mf-artifact-"));
process.env.MEDIAFORGE_DATA_DIR=tmp;
process.env.FRAME_LAB_DATA_DIR=join(tmp,"frame-lab");
process.env.MEDIAFORGE_WORKER_TOKEN="frame-lab-integration-test-worker-token-123456789abcdef";
const {handleRemoteWorker}=await import("../../src/remote-worker-server.mjs");
const jobId="a".repeat(32),projectId="b".repeat(32),lease="test-lease-003";
const jobsDir=join(tmp,"jobs"),projectRoot=join(tmp,"frame-lab",projectId);
await mkdir(jobsDir,{recursive:true});
await mkdir(projectRoot,{recursive:true});
await writeFile(join(jobsDir,jobId+".json"),JSON.stringify({
  id:jobId,status:"processing",
  workerLease:{id:lease,workerId:"qa-worker",expiresAt:new Date(Date.now()+600000).toISOString()},
  metadata:{source:"frame-lab",frameLabProjectId:projectId}
}));
const media=Buffer.alloc(1000);media.write("demo-video-payload");
const sha=createHash("sha256").update(media).digest("hex");
async function invoke({token=process.env.MEDIAFORGE_WORKER_TOKEN,leaseId=lease,
  expectedSha=sha,data=media}={}){
 const request=Readable.from([data]);
 request.method="POST";
 request.headers={
   authorization:token?"Bearer "+token:"",
   "x-mediaforge-lease":leaseId,
   "x-mediaforge-artifact-sha256":expectedSha,
   "content-type":"video/mp4",
   "content-length":String(data.length)
 };
 const result={code:null,body:""};
 const response={
   writeHead(status){result.code=status;return this;},
   end(text=""){result.body+=String(text);}
 };
 await handleRemoteWorker({
   request,response,
   url:new URL("https://example.local/v1/worker/jobs/"+jobId+"/artifact"),
   jobsDir,projectsRoot:join(tmp,"projects"),
   workerStatusFile:join(tmp,"worker-status.json")
 });
 return {...result,json:()=>JSON.parse(result.body)};
}
test("rendered artifact endpoint requires a valid worker token and current lease",async()=>{
 assert.equal((await invoke({token:""})).code,401);
 assert.equal((await invoke({leaseId:"other-lease"})).code,409);
});
test("checksum mismatch rejects artwork and prevents corrupted comparison",async()=>{
 const rejected=await invoke({expectedSha:"0".repeat(64)});
 assert.notEqual(rejected.code,200);
 await assert.rejects(stat(join(projectRoot,"render.mp4")),/ENOENT/);
});
test("valid render arrives in the same Frame Lab project for comparison",async()=>{
 const r=await invoke();
 assert.equal(r.code,200);
 assert.equal(r.json().sha256,sha);
 assert.equal(r.json().frameLabProjectId,projectId);
 assert.deepEqual(await readFile(join(projectRoot,"render.mp4")),media);
});
test.after(async()=>{await rm(tmp,{recursive:true,force:true})});
