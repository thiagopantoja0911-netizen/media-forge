import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

async function freePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.on("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const n=server.address().port;
      server.close(()=>resolve(n));
    });
  });
}
async function ready(url){
  for(let i=0;i<90;i++){
    try{const r=await fetch(url+"/health");if(r.ok)return}
    catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error("Frame Lab server did not start");
}
test("isolated API requires authorization; project and ROI are scoped",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"frame-lab-"));
  const port=await freePort();
  const key="frame-lab-synthetic-test-secret-0123456789";
  const url="http://127.0.0.1:"+port;
  const child=spawn(process.execPath,["server.mjs"],{
    cwd:new URL("..",import.meta.url).pathname,
    env:{...process.env,FRAME_LAB_HOST:"127.0.0.1",PORT:String(port),
      FRAME_LAB_KEY:key,FRAME_LAB_DATA_DIR:temp,NODE_ENV:"production"},
    stdio:["ignore","pipe","pipe"]
  });
  let logs="";
  child.stdout.on("data",d=>logs+=String(d));
  child.stderr.on("data",d=>logs+=String(d));
  try{
    await ready(url);
    const noKey=await fetch(url+"/api/projects");
    assert.equal(noKey.status,401);
    const badLogin=await fetch(url+"/api/auth",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({key:"not-a-secret"})
    });
    assert.equal(badLogin.status,401);
    const login=await fetch(url+"/api/auth",{method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({key})});
    assert.equal(login.status,200);
    const headers={"x-frame-lab-key":key,"content-type":"application/json"};
    const created=await fetch(url+"/api/projects",{method:"POST",headers});
    assert.equal(created.status,201);
    const obj=await created.json();
    assert.match(obj.id,/^[0-9a-f]{32}$/);
    const valid=await fetch(url+"/api/projects/"+obj.id+"/objects",{method:"POST",
      headers,body:JSON.stringify({objects:[{label:"card",x:10,y:12,w:30,h:40,startFrame:0}]})});
    assert.equal(valid.status,200);
    const pathTraversal=await fetch(url+"/api/projects/../../../../etc/passwd", {headers});
    assert.equal(pathTraversal.status,404);
    const nonexistent=await fetch(url+"/api/projects/00000000000000000000000000000000/status",{headers});
    assert.equal(nonexistent.status,404);
    const noMedia=await fetch(url+"/api/projects/"+obj.id+"/analyze",{method:"POST",headers});
    assert.equal(noMedia.status,400);
  }finally{
    child.kill("SIGTERM");
    await rm(temp,{recursive:true,force:true});
  }
});
