import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = await mkdtemp(join(tmpdir(),"frame-lab-bridge-"));
process.env.FRAME_LAB_DATA_DIR = temp;
const { handleFrameLab }=await import("../handler.mjs");
async function makeRequest(path,{authorized=false,method="GET",origin=null}={}){
  const headers={host:"mediaforge.localhost"};
  if(origin)headers.origin=origin;
  const status={code:null,headers:{},body:""};
  const response={
    headersSent:false,
    writeHead(code,extra={}){status.code=code;status.headers=extra;this.headersSent=true;return this;},
    end(body=""){status.body+=String(body);},
    destroy(){throw Error("response.destroy unexpectedly called")},
    setHeader(key,value){status.headers[key]=value;}
  };
  const handled=await handleFrameLab({
    request:{method,headers},response,
    url:new URL("http://mediaforge.localhost"+path),
    isAdminSession:async()=>authorized
  });
  return {...status,handled};
}
test("unrelated routes are not intercepted",async()=>{
  const r=await makeRequest("/health");
  assert.equal(r.handled,false);
});
test("unsigned browser requests redirect to MediaForge admin login",async()=>{
  const r=await makeRequest("/frame-lab");
  assert.equal(r.code,302);
  assert.equal(r.headers.location,"/dashboard");
});
test("anonymous frame and project API requests are rejected",async()=>{
  const r=await makeRequest("/frame-lab/api/projects");
  assert.equal(r.code,401);
  assert.equal(JSON.parse(r.body).error,"AUTH_REQUIRED");
});
test("authenticated admin receives same-origin Frame Lab UI",async()=>{
  const r=await makeRequest("/frame-lab",{authorized:true});
  assert.equal(r.code,200);
  assert.match(r.headers["content-type"],/text\/html/);
  assert.match(r.body,/\/frame-lab\/api\/projects/);
  assert.doesNotMatch(r.body,/x-frame-lab-key/);
  assert.match(r.body,/Reconstruction|Reconstrução/);
});
test("cross-origin admin POST requests are refused",async()=>{
  const r=await makeRequest("/frame-lab/api/projects",{
    authorized:true,method:"POST",origin:"https://evil.example"
  });
  assert.equal(r.code,403);
  assert.equal(JSON.parse(r.body).error,"CROSS_ORIGIN_MUTATION_REJECTED");
});
test("Frame Lab reports capabilities through signed-in MediaForge route",async()=>{
  const r=await makeRequest("/frame-lab/api/capabilities",{authorized:true});
  assert.equal(r.code,200);
  const c=JSON.parse(r.body);
  assert.equal(c.noTemporalSampling,true);
  assert.equal(c.engineReady,true,"Bundled FFmpeg/OpenCV engine required");
});
test.after(async()=>{await rm(temp,{recursive:true,force:true})});
