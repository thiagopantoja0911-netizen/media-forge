import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function unusedPort(){
  const server=createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
test("bootstrap secrets stop working after first-time setup rotates credentials",async()=>{
  const root=await mkdtemp(join(tmpdir(),"mediaforge-token-retire-"));
  const port=await unusedPort(),base="http://127.0.0.1:"+port;
  const bootstrapMcp="bootstrap-mcp-"+"e".repeat(40);
  const bootstrapWorker="bootstrap-worker-"+"f".repeat(40);
  const setupToken="setup-"+"g".repeat(40);
  const server=spawn(process.execPath,["src/server.mjs"],{cwd:process.cwd(),env:{
    ...process.env,MEDIAFORGE_HOST:"127.0.0.1",MEDIAFORGE_PORT:String(port),
    MEDIAFORGE_DATA_DIR:root,MEDIAFORGE_PROJECTS_DIR:join(root,"projects"),
    MEDIAFORGE_REQUIRE_AUTH:"true",MEDIAFORGE_SETUP_TOKEN:setupToken,
    MEDIAFORGE_MCP_TOKEN:bootstrapMcp,MEDIAFORGE_WORKER_TOKEN:bootstrapWorker
  },stdio:["ignore","pipe","pipe"]});
  let logs="";server.stdout.on("data",x=>logs+=x.toString());server.stderr.on("data",x=>logs+=x.toString());
  try{
    let up=false;
    for(let i=0;i<60;i++){
      if(server.exitCode!==null)throw new Error("Server exited: "+logs);
      try{if((await fetch(base+"/health")).ok){up=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(up,"Server failed to start: "+logs);
    const configured=await fetch(base+"/api/setup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      setup_token:setupToken,password:"A-Secure-MediaForge-Admin-2026!"
    })});
    assert.equal(configured.status,200);
    const secrets=await configured.json();
    assert.ok(secrets.plugin_token);assert.ok(secrets.worker_token);

    const oldMcp=await fetch(base+"/mcp",{method:"POST",headers:{
      authorization:"Bearer "+bootstrapMcp,"content-type":"application/json"
    },body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list",params:{}})});
    assert.equal(oldMcp.status,401);

    const newMcp=await fetch(base+"/mcp",{method:"POST",headers:{
      authorization:"Bearer "+secrets.plugin_token,"content-type":"application/json"
    },body:JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/list",params:{}})});
    assert.equal(newMcp.status,200);

    const oldRest=await fetch(base+"/v1/jobs",{headers:{authorization:"Bearer "+bootstrapMcp}});
    assert.equal(oldRest.status,401);
    const newRest=await fetch(base+"/v1/jobs",{headers:{authorization:"Bearer "+secrets.plugin_token}});
    assert.equal(newRest.status,200);

    const oldWorker=await fetch(base+"/v1/worker/heartbeat",{method:"POST",headers:{
      authorization:"Bearer "+bootstrapWorker,"content-type":"application/json"
    },body:JSON.stringify({workerId:"old-worker"})});
    assert.equal(oldWorker.status,401);
    const newWorker=await fetch(base+"/v1/worker/heartbeat",{method:"POST",headers:{
      authorization:"Bearer "+secrets.worker_token,"content-type":"application/json"
    },body:JSON.stringify({workerId:"new-worker"})});
    assert.equal(newWorker.status,200);
  }finally{server.kill("SIGTERM");await rm(root,{recursive:true,force:true});}
});
