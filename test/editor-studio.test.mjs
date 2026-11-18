import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  makeEditorProject, validateEditorProject, saveEditorProject, loadEditorProject,
  latestEditorProject, editorStoreDir
} from "../src/editor-studio-core.mjs";
import { buildEditorIndex, buildEditorSceneModule, buildEditorRenderFiles } from "../src/editor-studio-engine.mjs";
import { handleEditorStudioHttp, handleEditorJobStatus } from "../src/editor-studio-http.mjs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";

const originalEnv=process.env.MEDIAFORGE_DATA_DIR;
const temp=await mkdtemp(join(tmpdir(),"mediaforge-editor-"));
process.env.MEDIAFORGE_DATA_DIR=temp;
const idea="Quero explicar marketing digital usando objetos tridimensionais e câmera em movimento.";
const fresh=()=>makeEditorProject({idea,brand:"FORJA",duration_seconds:30,aspect_ratio:"9:16",fps:30});
test.after(async()=>{
  if(originalEnv===undefined)delete process.env.MEDIAFORGE_DATA_DIR;
  else process.env.MEDIAFORGE_DATA_DIR=originalEnv;
  await rm(temp,{recursive:true,force:true});
});
test("idea produces 3D, contiguous timeline with usable end cards",()=>{
 const p=fresh();
 assert.equal(p.version,1);
 assert.equal(p.totalFrames,900);
 assert.equal(p.scenes.length,7);
 assert.equal(p.mode,"cinematic-3d");
 assert.equal(p.scenes[0].startFrame,0);
 assert.equal(p.scenes.at(-1).endFrame,900);
 assert.ok(p.scenes.every(x=>x.endFrame>x.startFrame));
 assert.ok(p.scenes.every(x=>x.shape&&x.camera&&x.headline));
 assert.equal(validateEditorProject(p),p);
});
test("no revision history: only current project file persists",async()=>{
 const p=await saveEditorProject(fresh());
 assert.equal((await loadEditorProject(p.id)).revision,0);
 p.scenes[0].headline="Marketing com movimento de câmera";
 const update=await saveEditorProject(p,{expectedRevision:0});
 assert.equal(update.revision,1);
 assert.equal((await latestEditorProject()).id,p.id);
 await assert.rejects(()=>saveEditorProject(p,{expectedRevision:0}),e=>e.code==="EDITOR_CONFLICT");
 const names=(await readdir(editorStoreDir())).filter(n=>n.endsWith(".json"));
 assert.equal(names.length,1);
});
test("HTML preview contains only the selected scene and uses same 3D renderer as final",async()=>{
 const p=fresh();
 const preview=buildEditorIndex(p,{preview:true,sceneIndex:2,projectId:p.id});
 assert.match(preview,/scene\.mjs\?scene=2/);
 assert.match(preview,/WEBGL|WebGL|canvas/);
 assert.match(preview,/data-track-index="1"/);
 assert.doesNotMatch(preview,/assets\/audio\//);
 const script=buildEditorSceneModule(p,{preview:true,sceneIndex:2});
 assert.match(script,/THREE\.WebGLRenderer/);
 assert.match(script,/hf-seek/);
 assert.match(script,/window\.__timelines\.main/);
 assert.match(script,/MeshPhysicalMaterial/);
 assert.match(script,/Camera|camera/);
 assert.ok(script.includes("D="+((p.scenes[2].endFrame-p.scenes[2].startFrame)/p.fps)+",preview="));
 const tmpFile=join(temp,"scene.mjs");
 await import("node:fs/promises").then(fs=>fs.writeFile(tmpFile,script));
 const parsed=spawnSync(process.execPath,["--check",tmpFile],{encoding:"utf8"});
 assert.equal(parsed.status,0,parsed.stderr);
});
test("render project packages local Three modules, license and motion source",async()=>{
 const files=await buildEditorRenderFiles(fresh());
 assert.ok(files.some(f=>f.path==="index.html"));
 assert.ok(files.some(f=>f.path==="assets/scene.mjs"));
 assert.ok(files.some(f=>f.path==="assets/three/build/three.module.js"));
 assert.ok(files.some(f=>f.path==="assets/three/build/three.core.js"));
 assert.ok(files.some(f=>f.path==="assets/three/LICENSE"));
 assert.ok(files.every(f=>typeof f.content==="string"));
 const index=files.find(f=>f.path==="index.html").content;
 assert.match(index,/data-composition-id="main"/);
 assert.match(index,/assets\/scene\.mjs/);
});
test("rejects unsafe mutation of duration, script injection is treated as text",()=>{
 const p=fresh();
 p.scenes[1].startFrame+=3;
 assert.throws(()=>validateEditorProject(p),e=>e.code==="SCENE_TIMING_INVALID");
 const malicious=fresh();
 malicious.scenes[0].headline='<script>alert("x")</script>';
 const html=buildEditorIndex(malicious,{sceneIndex:0,preview:true,projectId:malicious.id});
 assert.ok(html.includes("&lt;script&gt;"));
 assert.ok(!html.includes('<script>alert("x")'));
});
function fakeResponse(){
 return {status:0,headers:{},body:"",
 writeHead(code,heads){this.status=code;this.headers=heads||{};},
 end(v=""){this.body=String(v);}};
}
async function call(path,{method="GET",body,auth=true,createJob}={}){
 const response=fakeResponse();
 const request={url:path,method,headers:{host:"studio.example",origin:"https://studio.example","content-type":"application/json","sec-fetch-site":"same-origin"}};
 const result=await handleEditorStudioHttp({
  request,response,url:new URL(path,"https://studio.example"),
  parseBody:async()=>body,
  isAdminSession:async()=>auth,
  createJob:createJob||(async()=>({id:"a".repeat(32),status:"queued"})),
  getJob:async()=>null
 });
 return {handled:result,status:response.status,body:response.body,headers:response.headers};
}
test("routes enforce login and create current editor from idea",async()=>{
 const denied=await call("/api/editor/latest",{auth:false});
 assert.equal(denied.status,401);
 const created=await call("/api/editor/projects",{method:"POST",body:{idea}});
 assert.equal(created.status,201,created.body);
 const data=JSON.parse(created.body);
 assert.match(data.editorUrl,/\/editor\?project=/);
 const selected=await call("/api/editor/projects/"+data.project.id);
 assert.equal(selected.status,200);
 const preview=await call("/api/editor/projects/"+data.project.id+"/preview?scene=0");
 assert.equal(preview.status,200);
 assert.match(preview.body,/three/);
 const module=await call("/api/editor/projects/"+data.project.id+"/scene.mjs?scene=0");
 assert.equal(module.status,200);
 assert.match(module.body,/THREE\.WebGLRenderer/);
});
test("beat-sync API refuses to run until a music track is attached",async()=>{
 const p=await saveEditorProject(fresh());
 const result=await call("/api/editor/projects/"+p.id+"/beat-sync",{method:"POST",body:{}});
 assert.equal(result.status,422,result.body);
 assert.equal(JSON.parse(result.body).error,"MUSIC_TRACK_REQUIRED");
});
test("full and single-scene render require explicit confirmation; no queue on missing confirmation",async()=>{
 const p=await saveEditorProject(fresh());
 let count=0;
 const createJob=async job=>{count++;assert.equal(job.metadata.source,"mediaforge-visual-editor");assert.ok(job.projectFiles.length>=6);return{id:"b".repeat(32),status:"queued"};};
 const denied=await call("/api/editor/projects/"+p.id+"/render",{method:"POST",body:{},createJob});
 assert.equal(denied.status,428);
 assert.equal(count,0);
 const unreviewed=await call("/api/editor/projects/"+p.id+"/render",{method:"POST",body:{confirm:true,sceneIndex:1},createJob});
 assert.equal(unreviewed.status,428);
 assert.equal(count,0);
 const before=await call("/api/editor/projects/"+p.id+"/review");
 assert.equal(JSON.parse(before.body).status,"not-reviewed");
 const checks=p.scenes.map(s=>({scene_id:s.id,samples_seconds:[.1,Math.min(1.1,(s.endFrame-s.startFrame)/p.fps-.1)],
    preview_ready:true,text_legible:true,motion_ok:true,visual_ok:true,
    notes:"Amostras verificadas visualmente no player deste projeto."}));
 const reviewed=await call("/api/editor/projects/"+p.id+"/review",{method:"POST",body:{expected_revision:p.revision,decision:"pass",checks}});
 assert.equal(reviewed.status,200,reviewed.body);
 assert.equal(JSON.parse(reviewed.body).approved,true);
 const scene=await call("/api/editor/projects/"+p.id+"/render",{method:"POST",body:{confirm:true,sceneIndex:1},createJob});
 assert.equal(scene.status,202,scene.body);
 assert.equal(count,1);
});
test("connector exposes create and edit tools for placing ideas directly in timeline",()=>{
 const names=VIDEOS_SECRETS_TOOLS.map(t=>t.name);
 assert.ok(names.includes("create_editor_project"));
 assert.ok(names.includes("get_editor_project"));
 assert.ok(names.includes("edit_editor_project"));
 assert.ok(names.includes("review_editor_preview"));
 assert.ok(names.includes("create_video"));
});
