import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { zipSync, strToU8 } from "fflate";

const dir=await mkdtemp(join(tmpdir(),"mf-frame-pipeline-"));
process.env.FRAME_LAB_DATA_DIR=dir;
const {handleFrameLab}=await import("../handler.mjs");
let lastJob=null,created=0;
const isAdminSession=async()=>true;
const getJob=async id=>id===lastJob?.id?lastJob:null;
const createJob=async payload=>{
  created++;assert.equal(payload.metadata.source,"frame-lab");
  assert.ok(payload.projectFiles.find(x=>x.path==="index.html"));
  assert.equal(payload.project.aspectRatio,"9:16");
  assert.equal(payload.project.fps,30);
  lastJob={id:"a".repeat(32),status:"queued",progress:0};
  return lastJob;
};
async function request(path,method="GET",body=null,{auth=true,origin="http://example.local"}={}){
  const req=Readable.from(body?[body]:[]);
  req.method=method;
  req.headers={host:"example.local",origin,...(body?{"content-length":String(body.length)}:{})};
  const info={status:null,body:"",headers:{}};
  const response={
    headersSent:false,
    writeHead(status,headers={}){info.status=status;info.headers=headers;this.headersSent=true;return this;},
    end(data=""){info.body+=String(data);},
    destroy(){throw new Error("unexpected destroy")}
  };
  const ok=await handleFrameLab({
    request:req,response,url:new URL("http://example.local"+path),
    isAdminSession:auth?isAdminSession:async()=>false,
    createJob,getJob
  });
  return {...info,handled:ok,json:()=>JSON.parse(info.body)};
}
let id;
test("create protected Frame Lab project",async()=>{
  const r=await request("/frame-lab/api/projects","POST");
  assert.equal(r.status,201);
  id=r.json().id;assert.match(id,/^[0-9a-f]{32}$/);
  assert.equal((await request("/frame-lab/api/projects","GET",null,{auth:false})).status,401);
});
test("upload editable ZIP and validate bounded extraction",async()=>{
  const zip=Buffer.from(zipSync({
    "widget-rebuild/index.html":strToU8('<html data-duration="2"><div class="clip" data-start="0" data-duration="2"></div></html>'),
    "widget-rebuild/assets/logo.png":new Uint8Array([137,80,78,71,1,2,3])
  }));
  const response=await request("/frame-lab/api/projects/"+id+"/upload/project","POST",zip);
  assert.equal(response.status,201);
  assert.equal(response.json().kind,"project");
  const noReport=await request("/frame-lab/api/projects/"+id+"/render-job","POST",
    Buffer.from(JSON.stringify({confirmRender:true})));
  assert.equal(noReport.status,409);
  const forged=Buffer.from(zipSync({"../evil.html":strToU8("pwn"),"index.html":strToU8("okay")}));
  const reject=await request("/frame-lab/api/projects/"+id+"/upload/project","POST",forged);
  assert.equal(reject.status,422);
  // Restore the safe ZIP for the rest of the workflow.
  assert.equal((await request("/frame-lab/api/projects/"+id+"/upload/project","POST",zip)).status,201);
});
test("render job is queued only after analysis, editable package and confirmation",async()=>{
  const results=join(dir,id,"results");await mkdir(results,{recursive:true});
  await writeFile(join(results,"report.json"),JSON.stringify({reference:{
    width:1080,height:1920,fps:30,duration_s:2,frameCount:60,frames:[]
  }}));
  const refused=await request("/frame-lab/api/projects/"+id+"/render-job","POST",
    Buffer.from(JSON.stringify({quality:"standard"})));
  assert.equal(refused.status,428);
  const result=await request("/frame-lab/api/projects/"+id+"/render-job","POST",
    Buffer.from(JSON.stringify({confirmRender:true,quality:"standard"})));
  assert.equal(result.status,202);
  assert.equal(result.json().jobId,lastJob.id);
  assert.equal(created,1);
  const status=await request("/frame-lab/api/projects/"+id+"/render-job");
  assert.equal(status.status,200);
  assert.equal(status.json().renderJob.status,"queued");
  const duplicate=await request("/frame-lab/api/projects/"+id+"/render-job","POST",
    Buffer.from(JSON.stringify({confirmRender:true})));
  assert.equal(duplicate.status,409);
  const premature=await request("/frame-lab/api/projects/"+id+"/compare","POST");
  assert.equal(premature.status,409);
});
test.after(async()=>rm(dir,{recursive:true,force:true}));
