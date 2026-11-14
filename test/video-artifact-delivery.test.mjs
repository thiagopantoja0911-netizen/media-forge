import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {mkdtemp,rm,stat} from "node:fs/promises";
import {randomBytes,createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function unusedPort(){
 const s=createServer();await new Promise(r=>s.listen(0,"127.0.0.1",r));
 const port=s.address().port;await new Promise(r=>s.close(r));return port;
}
test("authenticated worker uploads a checksum-validated MP4; short-lived chat download link is private",async()=>{
 const root=await mkdtemp(join(tmpdir(),"mediaforge-artifact-"));
 const port=await unusedPort(),base="http://127.0.0.1:"+port;
 const wt="worker-"+("a".repeat(48)),mt="mcp-"+("b".repeat(48));
 const srv=spawn(process.execPath,["src/server.mjs"],{cwd:process.cwd(),
  env:{...process.env,MEDIAFORGE_HOST:"127.0.0.1",MEDIAFORGE_PORT:String(port),MEDIAFORGE_DATA_DIR:root,
    MEDIAFORGE_PROJECTS_DIR:join(root,"projects"),MEDIAFORGE_RENDERER:"dry-run",MEDIAFORGE_REQUIRE_AUTH:"true",
    MEDIAFORGE_WORKER_TOKEN:wt,MEDIAFORGE_MCP_TOKEN:mt,MEDIAFORGE_PUBLIC_URL:base},
  stdio:["ignore","pipe","pipe"]});
 let stderr="";for(const stream of [srv.stdout,srv.stderr])stream.on("data",c=>stderr+=c.toString());
 const json=async(path,token,method="GET",data)=>{const r=await fetch(base+path,{method,
   headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})},
   body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 try{
  let healthy=false;
  for(let i=0;i<70;i++){
    if(srv.exitCode!==null)throw Error("Server stopped: "+stderr);
    try{const r=await fetch(base+"/health");if(r.ok){healthy=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(healthy,true,"Server failed to start: "+stderr);
  const created=await json("/v1/jobs",mt,"POST",{prompt:"Test a secured MP4 artifact transfer",
   project:{title:"Artifact test",durationSeconds:10,aspectRatio:"9:16",renderer:"hyperframes",fps:30},
   projectFiles:[{path:"index.html",content:"<!doctype html><html><body>Artifact test</body></html>"}]});
  assert.equal(created.status,202,JSON.stringify(created));
  const id=created.body.job.id;
  const claim=await json("/v1/worker/claim",wt,"POST",{workerId:"test-pc"});
  assert.equal(claim.status,200,JSON.stringify(claim));
  assert.equal(claim.body.job.id,id);
  const lease=claim.body.leaseId;
  const payload=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from("ftypisom"),randomBytes(2048)]);
  const sha=createHash("sha256").update(payload).digest("hex");
  const post=async(headers,token=wt)=>{const res=await fetch(base+"/v1/worker/jobs/"+id+"/artifact",{method:"POST",
    headers:{"content-type":"video/mp4","content-length":String(payload.length),
      "x-mediaforge-lease":lease,"x-mediaforge-artifact-sha256":sha,...headers,
      ...(token?{authorization:"Bearer "+token}:{})},body:payload});
   return {status:res.status,body:await res.json()};};
  assert.equal((await post({},null)).status,401,"No unauthenticated worker uploads");
  assert.equal((await post({"x-mediaforge-lease":"bad"})).status,409,"Invalid lease cannot upload");
  assert.notEqual((await post({"x-mediaforge-artifact-sha256":"f".repeat(64)})).status,200,"Bad hash cannot upload");
  const uploaded=await post({});
  assert.equal(uploaded.status,200,JSON.stringify(uploaded));
  assert.equal(uploaded.body.sha256,sha);
  assert.equal(uploaded.body.location,"mediaforge-hostinger");
  const mismatch=await json("/v1/worker/jobs/"+id+"/complete",wt,"POST",{
   leaseId:lease,success:true,artifactUploaded:true,fileName:"test.mp4",size:payload.length,sha256:"0".repeat(64)});
  assert.equal(mismatch.status,409,"Job must match actual upload receipt");
  const finished=await json("/v1/worker/jobs/"+id+"/complete",wt,"POST",{
   leaseId:lease,success:true,artifactUploaded:true,fileName:"test.mp4",size:payload.length,sha256:sha,
   outputPath:"C:\\Users\\Test\\Downloads\\MediaForge\\test.mp4",report:{artisticQA:"pending"}});
  assert.equal(finished.status,200,JSON.stringify(finished));
  const denied=await json("/v1/jobs/"+id,null);
  assert.equal(denied.status,401,"Metadata requires user auth");
  const data=await json("/v1/jobs/"+id,mt);
  assert.equal(data.status,200);
  assert.equal(data.body.job.status,"completed");
  assert.equal(data.body.artifact.sha256,sha);
  assert.equal(data.body.artifact.size,payload.length);
  assert.ok(data.body.artifact.url.startsWith(base+"/v1/video-download/"+id));
  const delivered=await fetch(data.body.artifact.url);
  assert.equal(delivered.status,200);
  assert.equal(delivered.headers.get("content-type"),"video/mp4");
  assert.equal(delivered.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),payload);
  const tampered=new URL(data.body.artifact.url);tampered.searchParams.set("signature","f".repeat(64));
  assert.equal((await fetch(tampered)).status,403,"HMAC prevents URL tampering");
  const expired=new URL(data.body.artifact.url);expired.searchParams.set("expires",String(Date.now()-10000));
  assert.equal((await fetch(expired)).status,403,"Expired links cannot download");
  assert.equal((await fetch(base+"/v1/video-download/"+id)).status,403,"Unsigned download denied");
  const file=await stat(join(root,"artifacts",id+".mp4"));assert.equal(file.size,payload.length);
 }finally{
  srv.kill("SIGTERM");
  await new Promise(resolve=>{if(srv.exitCode!==null)return resolve();srv.once("exit",resolve);});
  await rm(root,{recursive:true,force:true});
 }
});
