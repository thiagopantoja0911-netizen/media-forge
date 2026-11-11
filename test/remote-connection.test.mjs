import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function unusedPort() {
  const server=createServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function request(base,path,token,method="GET",body,headers={}) {
  const response=await fetch(base+path,{method,headers:{
    ...(token?{authorization:"Bearer "+token}:{}),
    ...(body?{"content-type":"application/json"}:{}),
    ...headers
  },body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
}
test("authenticated ChatGPT -> API -> Windows remote worker handshake", async()=>{
  const root=await mkdtemp(join(tmpdir(),"mediaforge-conn-"));
  const port=await unusedPort();
  const base="http://127.0.0.1:"+port;
  const workerToken="worker-"+"a".repeat(48),mcpToken="mcp-"+"b".repeat(48);
  const server=spawn(process.execPath,["src/server.mjs"],{cwd:process.cwd(),env:{
    ...process.env,MEDIAFORGE_HOST:"127.0.0.1",MEDIAFORGE_PORT:String(port),
    MEDIAFORGE_DATA_DIR:root,MEDIAFORGE_PROJECTS_DIR:join(root,"projects"),
    MEDIAFORGE_RENDERER:"dry-run",MEDIAFORGE_REQUIRE_AUTH:"true",
    MEDIAFORGE_WORKER_TOKEN:workerToken,MEDIAFORGE_MCP_TOKEN:mcpToken
  },stdio:["ignore","pipe","pipe"]});
  let logs="";
  server.stdout.on("data",c=>logs+=c.toString());
  server.stderr.on("data",c=>logs+=c.toString());
  try{
    let up=false;
    for(let i=0;i<60;i++){
      if(server.exitCode!==null)throw new Error("Server terminated: "+logs);
      try{const r=await fetch(base+"/health");if(r.ok){up=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(up,true,"server started "+logs);
    const unauthorized=await request(base,"/v1/jobs",null);
    assert.equal(unauthorized.status,401);
    const payload={
      prompt:"Criar movimento de alta qualidade.",
      project:{title:"Teste de conexoes",durationSeconds:10,aspectRatio:"9:16",renderer:"hyperframes",
        resolution:"portrait-4k",fps:60,quality:"high"},
      projectFiles:[{path:"index.html",content:"<!doctype html><html><body>MediaForge</body></html>"}]
    };
    const created=await request(base,"/v1/jobs",mcpToken,"POST",payload);
    assert.equal(created.status,202,JSON.stringify(created.data));
    const id=created.data.job.id;
    assert.match(id,/^[a-f0-9]{32}$/);
    assert.equal((await request(base,"/v1/worker/claim",null,"POST",{workerId:"local-test"})).status,401);
    const claimed=await request(base,"/v1/worker/claim",workerToken,"POST",{workerId:"windows-test"});
    assert.equal(claimed.status,200,JSON.stringify(claimed.data));
    assert.equal(claimed.data.job.id,id);
    assert.equal(claimed.data.job.project.fps,60);
    assert.equal(claimed.data.job.project.quality,"high");
    const leaseId=claimed.data.leaseId;
    assert.ok(leaseId);
    const project=await request(base,"/v1/worker/jobs/"+id+"/project",workerToken,"GET",undefined,{"x-mediaforge-lease":leaseId});
    assert.equal(project.status,200);
    assert.equal(project.data.files.length,1);
    assert.match(Buffer.from(project.data.files[0].contentBase64,"base64").toString("utf8"),/MediaForge/);
    const heartbeat=await request(base,"/v1/worker/heartbeat",workerToken,"POST",{workerId:"windows-test",jobId:id,leaseId});
    assert.equal(heartbeat.status,200);
    const complete=await request(base,"/v1/worker/jobs/"+id+"/complete",workerToken,"POST",{
      leaseId,success:true,fileName:"test-4k60.mp4",size:2435,sha256:"c".repeat(64),
      outputPath:"C:\\MediaForge\\test-4k60.mp4",report:{fps:60,width:2160,height:3840}
    });
    assert.equal(complete.status,200,JSON.stringify(complete.data));
    const final=await request(base,"/v1/jobs/"+id,mcpToken);
    assert.equal(final.status,200);
    assert.equal(final.data.job.status,"completed");
    assert.equal(final.data.job.result.report.fps,60);
    assert.equal((await request(base,"/v1/jobs/"+id,null)).status,401);
    assert.equal((await request(base,"/v1/worker/claim",workerToken,"POST",{workerId:"other"})).data.job,null);
  }finally{
    server.kill("SIGTERM");await rm(root,{recursive:true,force:true});
  }
});
