import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION="2026-07-28";
const META="io.modelcontextprotocol/protocolVersion";
async function unusedPort(){
  const server=createServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function call(base,token,method,id,params={},extraHeaders={}){
  const headers={
    authorization:"Bearer "+token,"content-type":"application/json",
    "mcp-protocol-version":VERSION,"mcp-method":method,...extraHeaders
  };
  const response=await fetch(base+"/mcp",{method:"POST",headers,body:JSON.stringify({
    jsonrpc:"2.0",id,method,params:{...params,_meta:{[META]:VERSION}}
  })});
  return {status:response.status,headers:response.headers,body:await response.json()};
}
test("MediaForge supports MCP 2026 stateless discovery, calls and offline GSAP normalization",async()=>{
  const root=await mkdtemp(join(tmpdir(),"mediaforge-mcp26-"));
  const port=await unusedPort(),base="http://127.0.0.1:"+port;
  const token="mcp-"+"c".repeat(48),worker="worker-"+"d".repeat(48);
  const server=spawn(process.execPath,["src/server.mjs"],{cwd:process.cwd(),env:{
    ...process.env,MEDIAFORGE_HOST:"127.0.0.1",MEDIAFORGE_PORT:String(port),
    MEDIAFORGE_DATA_DIR:root,MEDIAFORGE_PROJECTS_DIR:join(root,"projects"),
    MEDIAFORGE_RENDERER:"hyperframes",MEDIAFORGE_REQUIRE_AUTH:"true",
    MEDIAFORGE_MCP_TOKEN:token,MEDIAFORGE_WORKER_TOKEN:worker
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

    const discovery=await call(base,token,"server/discover",1);
    assert.equal(discovery.status,200,JSON.stringify(discovery.body));
    assert.deepEqual(discovery.body.result.supportedVersions,[VERSION]);
    assert.equal(discovery.body.result.resultType,"complete");
    assert.equal(discovery.body.result.cacheScope,"private");
    assert.equal(discovery.headers.get("mcp-session-id"),null);

    const tools=await call(base,token,"tools/list",2);
    assert.equal(tools.status,200);
    assert.equal(tools.body.result.tools.length,4);
    assert.equal(tools.body.result.ttlMs,0);
    assert.equal(tools.body.result._meta["io.modelcontextprotocol/serverInfo"].name,"mediaforge");
    assert.equal(tools.headers.get("mcp-session-id"),null);

    const status=await call(base,token,"tools/call",3,{name:"renderer_status",arguments:{}},{"mcp-name":"renderer_status"});
    assert.equal(status.status,200);
    assert.match(status.body.result.content[0].text,/queued_jobs/);

    const created=await call(base,token,"tools/call",4,{
      name:"create_video",
      arguments:{
        title:"Teste GSAP offline",prompt:"Validar o projeto GSAP offline antes do render.",
        duration_seconds:10,aspect_ratio:"9:16",
        project_files:[{path:"index.html",content:'<!doctype html><html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script></head><body><div id="x"></div><script>gsap.to("#x",{x:20})</script></body></html>'}]
      }
    },{"mcp-name":"create_video"});
    assert.equal(created.status,200,JSON.stringify(created.body));
    assert.equal(created.body.result.resultType,"complete");
    const result=JSON.parse(created.body.result.content[0].text);
    assert.equal(result.status,"queued");
    const jobResponse=await fetch(base+"/v1/jobs/"+result.id,{headers:{authorization:"Bearer "+token}});
    assert.equal(jobResponse.status,200);
    const job=(await jobResponse.json()).job;
    assert.equal(job.project.resolution,"portrait-4k");
    assert.equal(job.project.fps,60);
    assert.equal(job.project.quality,"high");
    assert.equal(job.project.fileCount,2);
    const html=await readFile(join(root,"projects",result.id,"index.html"),"utf8");
    assert.match(html,/src="assets\/gsap\.min\.js"/);
    assert.doesNotMatch(html,/cdnjs\.cloudflare/);
    const asset=await readFile(join(root,"projects",result.id,"assets","gsap.min.js"));
    assert.ok(asset.length>=65000);

    const bad=await call(base,token,"tools/call",5,{name:"renderer_status",arguments:{}},{"mcp-name":"wrong_name"});
    assert.equal(bad.status,400);
    assert.equal(bad.body.error.message,"MCP_NAME_HEADER_MISMATCH");
  }finally{
    server.kill("SIGTERM");await rm(root,{recursive:true,force:true});
  }
});
