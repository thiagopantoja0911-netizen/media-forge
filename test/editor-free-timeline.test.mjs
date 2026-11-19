import test from "node:test";
import assert from "node:assert/strict";
import { Script,runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { makeEditorProject,validateEditorProject } from "../src/editor-studio-core.mjs";
import { applyEditorTimelineOperations } from "../src/editor-timeline.mjs";
import { buildEditorIndex,buildEditorSceneModule,buildEditorRenderFiles } from "../src/editor-studio-engine.mjs";
import { validateEditorPreviewReview } from "../src/editor-review-gate.mjs";
import { freeTimelineRuntime } from "../src/editor-free-timeline.mjs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const free=(duration=36)=>makeEditorProject({idea:"Timeline multipista profissional sem cenas obrigatórias",title:"Timeline livre",brand:"MediaForge",timeline_mode:"free",duration_seconds:duration,fps:30,aspect_ratio:"9:16"});
const hex="a".repeat(32);
function addTitle(p){
 return applyEditorTimelineOperations(p,{layer_operations:[{action:"add",layer:{id:hex,type:"text",text:"TIPOGRAFIA EDITÁVEL",name:"Título independente",startFrame:13,endFrame:87,x:50,y:200,color:"#ffffff",fontFamily:"impact",fontSize:96,fontWeight:900,textAlign:"center",transitionIn:{type:"slide-left",frames:15},transitionOut:{type:"fade",frames:10},
 keyframes:[{frame:13,x:50,opacity:0,easing:"linear"},{frame:42,x:190,opacity:1,easing:"ease-in-out"},{frame:80,x:380,opacity:1,easing:"ease-out"}]}}]});
}
test("free timeline is valid without scenes and can be 1–600s long",()=>{
 for(const duration of [1,2,17,36,61,275,600]){
  const p=free(duration);
  assert.equal(p.mode,"timeline-free");assert.deepEqual(p.scenes,[]);
  assert.equal(p.totalFrames,duration*30);
  assert.equal(p.layers.length,0);assert.equal(p.audio.length,0);
  assert.doesNotThrow(()=>validateEditorProject(p));
 }
 const old=makeEditorProject({idea:"Manter a composição 3D existente sem alterações"});
 assert.equal(old.mode,"cinematic-3d");
 assert.ok(old.scenes.length>=3);
 old.scenes=[];
 assert.throws(()=>validateEditorProject(old),/cenas/);
 const p=free();
 p.scenes=[{id:"scene-1"}];
 assert.throws(()=>validateEditorProject(p),/timeline livre/);
 p.scenes=[];p.totalFrames=30*601;
 assert.throws(()=>validateEditorProject(p),/duração/);
});
test("layers and captions are independent from scene boundaries and retain transitions",()=>{
 const p=addTitle(free());
 assert.equal(p.layers[0].startFrame,13);
 assert.equal(p.layers[0].endFrame,87);
 assert.equal(p.layers[0].transitionIn.type,"slide-left");
 assert.equal(p.layers[0].fontFamily,"impact");
 assert.equal(p.layers[0].keyframes.length,3);
 assert.doesNotThrow(()=>validateEditorProject(p));
 p.layers[0].transitionIn.frames=180;
 assert.throws(()=>validateEditorProject(p),/Transição por clipe/);
});
test("free renderer contains no default permanent 3D floor, canvas or scene captions",async()=>{
 const p=addTitle(free());
 const html=buildEditorIndex(p,{preview:true,projectId:p.id});
 assert.doesNotMatch(html,/id="world"/);
 assert.doesNotMatch(html,/id="caption-0"/);
 assert.match(html,/id="layer-/);
 assert.match(html,/background:#0b1018/);
 const js=buildEditorSceneModule(p,{preview:true});
 assert.match(js,/editor-free-timeline/);
 assert.match(js,/hf-seek/);
 assert.doesNotMatch(js,/new THREE.WebGLRenderer/);
 assert.doesNotThrow(()=>new Script(js));
 const files=await buildEditorRenderFiles(p);
 assert.ok(files.some(f=>f.path==="assets/scene.mjs"));
 assert.ok(!files.some(f=>f.path.includes("three/build")));
});
test("owner can review the full video timeline at two real timestamps",()=>{
 const p=addTitle(free(45));
 const sample={scene_id:"timeline",samples_seconds:[2.5,37.5],
  preview_ready:true,text_legible:true,motion_ok:true,visual_ok:true,notes:"Revisão visual das camadas no monitor do editor."};
 const result=validateEditorPreviewReview(p,{expected_revision:p.revision,decision:"pass",checks:[sample]});
 assert.equal(result.checks.length,1);assert.equal(result.checks[0].scene_id,"timeline");
 assert.throws(()=>validateEditorPreviewReview(p,{expected_revision:p.revision,decision:"pass",checks:[{...sample,samples_seconds:[2.5,2.5]}]}),/dois instantes/);
});
test("native free compositor interpolates keyframes and preserves transitions frame by frame",async()=>{
 const layer={id:hex,name:"Título",type:"text",text:"ABERTURA",startFrame:0,endFrame:90,x:50,y:200,z:0,
 width:700,height:200,rotationX:0,rotationY:0,rotationZ:0,scale:1,opacity:1,transitionIn:{type:"slide-left",frames:15},
 keyframes:[{frame:0,x:50,opacity:0},{frame:30,x:250,opacity:1,easing:"ease-in-out"},{frame:85,x:350,opacity:1}]};
 const element={style:{},querySelectorAll:()=>[]},listeners={};
 const sandbox={timelineProject:{fps:30,totalFrames:120,width:1080,height:1920,layers:[layer],captions:[]},
  document:{getElementById:id=>id==="layer-"+hex?element:null},
  window:{__hf:{},__timelines:{},addEventListener:(event,fn)=>{listeners[event]=fn;},parent:{postMessage(){} }},
  location:{origin:"https://unificmedia.salevo.site"},
  performance:{now:()=>0},requestAnimationFrame:()=>{},setTimeout,clearTimeout,Promise,Math,Number};
 runInNewContext("("+freeTimelineRuntime.toString()+")()",sandbox);
 await sandbox.window.__hf.buildReady["editor-free-timeline"];
 assert.match(element.style.transform,/translate3d\(-1030px/);
 const seek=async(seconds)=>{
  let pending;listeners["hf-seek"]({detail:{time:seconds,waitUntil:p=>{pending=p;}}});
  await pending;
 };
 await seek(1);
 assert.match(element.style.transform,/translate3d\(250px/);
 assert.equal(element.style.opacity,"1");
 await seek(3.1);
 assert.equal(element.style.visibility,"hidden");
});
test("editor UI exposes full duration, audio import, typography, real clip transitions and owner approval",()=>{
 const html=read("editor-studio/index.html"),app=read("editor-studio/app.js"),tools=read("editor-studio/workspace-layout.js");
 assert.match(html,/id="newEditorMode"/);
 assert.match(html,/id="timelineFontFamily"/);
 assert.match(html,/id="timelineClipTransitions"/);
 assert.match(html,/id="freeReviewButton"/);
 assert.match(tools,/api\(\)\?\.addLayer/);
 assert.match(tools,/api\(\)\?\.importAsset\("audio"\)/);
 assert.match(app,/setDuration:seconds/);
 assert.match(app,/scene_id:"timeline"/);
 assert.match(app,/allowSilent=true/);
 assert.doesNotThrow(()=>new Script(app));
 assert.doesNotThrow(()=>new Script(tools));
});

test("connected AI can create and edit scene-free projects through native MCP schema",()=>{
 const byName=name=>VIDEOS_SECRETS_TOOLS.find(x=>x.name===name);
 const create=byName("create_editor_project"),edit=byName("edit_editor_timeline"),render=byName("render_editor_project");
 assert.ok(create&&edit&&render);
 assert.deepEqual(create.inputSchema.properties.timeline_mode.enum,["free","cinematic"]);
 assert.equal(create.inputSchema.properties.duration_seconds.maximum,600);
 assert.equal(edit.inputSchema.properties.duration_seconds.maximum,600);
 assert.equal(edit.inputSchema.properties.canvas_color.pattern,"^#[a-fA-F0-9]{6}$");
 const layer=edit.inputSchema.properties.layer_operations.items.properties.layer.properties;
 assert.ok(layer.transitionIn);assert.ok(layer.transitionOut);
 assert.ok(layer.fontFamily.enum.includes("impact"));
 assert.ok(render.inputSchema.properties.allow_silent);
});
