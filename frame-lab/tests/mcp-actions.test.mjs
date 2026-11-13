import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {zipSync,strToU8} from "fflate";
const root=await mkdtemp(join(tmpdir(),"mf-mcp-chat-flow-"));
process.env.FRAME_LAB_DATA_DIR=root;
const {executeFrameLabMcp,FRAME_LAB_MCP_NAMES}=await import("../mcp-actions.mjs");
const sha=b=>createHash("sha256").update(b).digest("hex");
const call=(name,args,context)=>executeFrameLabMcp(name,args,context);
const mp4=Buffer.alloc(1024);
mp4.writeUInt32BE(24,0);mp4.write("ftyp",4);mp4.write("isom",8);
let id;
test("MCP Frame Lab tool discovery, project creation and readiness",async()=>{
 assert.ok(FRAME_LAB_MCP_NAMES.has("frame_lab_upload_chunk"));
 assert.ok(FRAME_LAB_MCP_NAMES.has("frame_lab_compare"));
 const caps=await call("frame_lab_capabilities",{});
 assert.equal(typeof caps.engineReady,"boolean");
 const project=await call("frame_lab_create_project",{});
 id=project.id;assert.match(id,/^[0-9a-f]{32}$/);
 assert.equal((await call("frame_lab_status",{project_id:id})).hasReference,false);
 assert.ok((await call("frame_lab_list_projects",{limit:10})).projects.some(x=>x.id===id));
});
test("MCP resumable binary upload protects offsets and SHA-256",async()=>{
 const start=await call("frame_lab_start_upload",{project_id:id,kind:"reference",total_bytes:mp4.length,sha256:sha(mp4)});
 assert.equal(start.max_chunk_bytes,384*1024);
 const upload_id=start.upload_id;
 const first=mp4.subarray(0,327);
 const second=mp4.subarray(327);
 const r1=await call("frame_lab_upload_chunk",{project_id:id,upload_id,offset:0,content_base64:first.toString("base64")});
 assert.equal(r1.next_offset,327);
 await assert.rejects(call("frame_lab_upload_chunk",{project_id:id,upload_id,offset:123,content_base64:second.toString("base64")}),/offset mismatch/);
 const offset=await call("frame_lab_upload_status",{project_id:id,upload_id});
 assert.equal(offset.next_offset,327);
 await assert.rejects(call("frame_lab_finish_upload",{project_id:id,upload_id}),/incomplete/);
 const r2=await call("frame_lab_upload_chunk",{project_id:id,upload_id,offset:327,content_base64:second.toString("base64")});
 assert.equal(r2.complete,true);
 const finished=await call("frame_lab_finish_upload",{project_id:id,upload_id});
 assert.equal(finished.sha256,sha(mp4));
 assert.deepEqual(await readFile(join(root,id,"reference.mp4")),mp4);
 assert.equal((await call("frame_lab_status",{project_id:id})).hasReference,true);
});
test("MCP rejects corrupt bytes and type spoofing",async()=>{
 const bad=Buffer.from(mp4);bad[100]=1;
 const start=await call("frame_lab_start_upload",{project_id:id,kind:"render",total_bytes:bad.length,sha256:sha(mp4)});
 const attrs={project_id:id,upload_id:start.upload_id,offset:0,content_base64:bad.toString("base64")};
 await call("frame_lab_upload_chunk",attrs);
 await assert.rejects(call("frame_lab_finish_upload",{project_id:id,upload_id:start.upload_id}),/SHA-256 mismatch/);
 const invalid=Buffer.alloc(512,20);
 const next=await call("frame_lab_start_upload",{project_id:id,kind:"render",total_bytes:invalid.length,sha256:sha(invalid)});
 await call("frame_lab_upload_chunk",{project_id:id,upload_id:next.upload_id,offset:0,content_base64:invalid.toString("base64")});
 await assert.rejects(call("frame_lab_finish_upload",{project_id:id,upload_id:next.upload_id}),/MP4 signature/);
});
test("MCP uploads authored ZIP then creates a protected MediaForge render job",async()=>{
 const zip=Buffer.from(zipSync({"my-frame-lab-project/index.html":
   strToU8('<!doctype html><html><body><div id="root" data-composition-id="main" data-duration="2" data-width="1080" data-height="1920"></div><script>window.__timelines={main:gsap.timeline({paused:true})};</script></body></html>')}));
 const start=await call("frame_lab_start_upload",{project_id:id,kind:"project",total_bytes:zip.length,sha256:sha(zip)});
 await call("frame_lab_upload_chunk",{project_id:id,upload_id:start.upload_id,offset:0,content_base64:zip.toString("base64")});
 const finished=await call("frame_lab_finish_upload",{project_id:id,upload_id:start.upload_id});
 assert.equal(finished.kind,"project");
 await assert.rejects(call("frame_lab_render",{project_id:id,confirm_render:true}),/Analyze the reference/);
 const results=join(root,id,"results");await mkdir(results,{recursive:true});
 await writeFile(join(results,"report.json"),JSON.stringify({
  reference:{width:1080,height:1920,fps:60,duration_s:2,frameCount:120,frames:[
   {time_s:0,camera_dx_px:0,camera_dy_px:0,residual_p95_px:1,subpixel_motion_fraction:0.2}
  ]},
  reconstruction:{sceneCuts:[],objects:[]}
 }));
 const page=await call("frame_lab_report",{project_id:id,frame_offset:0,frame_limit:1});
 assert.equal(page.returned_frames,1);
 assert.equal(page.reference.frameCount,120);
 await assert.rejects(call("frame_lab_render",{project_id:id,confirm_render:false}),/Explicit confirm/);
 let queued=null;
 const context={
   createJob:async project=>{
     assert.equal(project.metadata.source,"frame-lab");
     assert.equal(project.project.fps,60);
     assert.ok(project.projectFiles.some(f=>f.path==="index.html"));
     queued={id:"f".repeat(32),status:"queued",progress:0};return queued;
   },
   getJob:async value=>value===queued?.id?queued:null
 };
 const render=await call("frame_lab_render",{project_id:id,confirm_render:true,quality:"standard"},context);
 assert.equal(render.status,"queued");
 const st=await call("frame_lab_status",{project_id:id},context);
 assert.equal(st.renderJob.status,"queued");
 await assert.rejects(call("frame_lab_render",{project_id:id,confirm_render:true},context),/rendering is active/);
 await assert.rejects(call("frame_lab_compare",{project_id:id}),/not available/);
});
test("MCP tools cannot escape project storage",async()=>{
 await assert.rejects(call("frame_lab_status",{project_id:"../secrets"}),/Invalid/);
 await assert.rejects(call("frame_lab_upload_status",{project_id:id,upload_id:"../x"}),/Invalid upload id/);
});
test.after(async()=>{await rm(root,{recursive:true,force:true})});
