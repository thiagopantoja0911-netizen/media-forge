import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { makeEditorProject, validateEditorProject } from "../src/editor-studio-core.mjs";
import { applyEditorTimelineOperations } from "../src/editor-timeline.mjs";
import { motionV2Runtime, auditMotionV2 } from "../src/editor-motion-v2.mjs";
import { buildEditorIndex, buildEditorSceneModule } from "../src/editor-studio-engine.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

function project(){
 let p=makeEditorProject({idea:"Criativos verticais com motion real e trajetórias visuais",duration_seconds:36,fps:30,aspect_ratio:"9:16"});
 p=applyEditorTimelineOperations(p,{layer_operations:[{action:"add",layer:{type:"text",name:"Headline",text:"Criativos profissionais",color:"#161b24",startFrame:0,endFrame:p.totalFrames,width:700,height:170}}]});
 const id=p.layers[0].id;
 p.motionV2={version:1,enabled:true,background:{keyframes:[
  {frame:0,color:"#ffffff",accent:"#dce5fa",pattern:"gradient",panX:-5,panY:0,zoom:1.02},
  {frame:450,color:"#151b2a",accent:"#5c70b9",pattern:"rings",panX:6,panY:3,zoom:1.10,ease:[.22,1,.36,1]},
  {frame:p.totalFrames,color:"#f8f6f0",accent:"#f6bacd",pattern:"grid",panX:0,panY:-2,zoom:1.01}
 ]},moves:{[id]:{enter:{from:"left",frames:18,ease:[.22,1,.36,1],mask:"none"},
  exit:{to:"right",frames:17,ease:"cubic-in"},
  path:[{frame:0,x:0,y:0,out:[180,-130]},{frame:530,x:110,y:-70,in:[-100,0],out:[90,130],ease:"ease-in-out"},
        {frame:p.totalFrames,x:0,y:0,in:[-140,80],ease:"ease-in-out"}]}}};
 return p;
}
test("project supports offscreen slides, Bézier trajectories and changing backgrounds",()=>{
 const p=project();
 assert.doesNotThrow(()=>validateEditorProject(p));
 const engine=motionV2Runtime(p.motionV2,1080,1920,30);
 const l=p.layers[0];
 const first=engine.layer(l,0),inMotion=engine.layer(l,6),arrived=engine.layer(l,25),last=engine.layer(l,p.totalFrames-1);
 assert.ok(first.x < -1000, "starts fully offscreen left");
 assert.ok(inMotion.x > first.x, "enters from left rather than fades in place");
 assert.ok(arrived.x > first.x+1000, "settles in visible stage");
 assert.ok(last.x > 900,"exits fully to right");
 const bg0=engine.background(0),mid=engine.background(200),end=engine.background(p.totalFrames);
 assert.notEqual(bg0.color,mid.color);assert.notEqual(bg0.color,end.color);
 assert.equal(end.pattern,"grid");
 assert.ok(Number.isFinite(engine.path(p.motionV2.moves[l.id],220).x));
});
test("legacy projects remain untouched and compatible",()=>{
 const p=makeEditorProject({idea:"Testar a composição antiga do MediaForge"});
 assert.doesNotThrow(()=>validateEditorProject(p));
 assert.equal(motionV2Runtime(null,1080,1920,30).background(15),null);
 const html=buildEditorIndex(p,{});
 assert.ok(!html.includes('id="motion-v2-bg"'));
});
test("scene preview and HyperFrames export include the exact same motion model",()=>{
 const p=project();
 const preview=buildEditorIndex(p,{sceneIndex:0,preview:true,projectId:p.id});
 const render=buildEditorIndex(p,{});
 const previewScene=buildEditorSceneModule(p,{sceneIndex:0,preview:true});
 const renderScene=buildEditorSceneModule(p,{});
 for(const html of [preview,render]){
  assert.match(html,/id="motion-v2-bg"/);
  assert.match(html,/assets|\/api\/editor\/projects/);
 }
 for(const scene of [previewScene,renderScene]){
  assert.match(scene,/const motionV2=/);
  assert.match(scene,/function motionV2Runtime/);
  assert.match(scene,/const motionEngine=motionV2Runtime/);
  assert.match(scene,/motionEngine\.background\(frame\)/);
  assert.match(scene,/motionEngine\.layer\(layer,frame\)/);
 }
});
test("reject unsafe/invalid background, unknown layers, and out-of-range curves",()=>{
 const p=project(),id=p.layers[0].id;
 p.motionV2.background.keyframes[0].color="red;position:fixed";
 assert.throws(()=>validateEditorProject(p),/fundo inválido|Keyframe de fundo inválido/);
 p.motionV2.background.keyframes[0].color="#ffffff";
 p.motionV2.moves["e".repeat(32)]={enter:{from:"left",frames:12}};
 assert.throws(()=>validateEditorProject(p),/inexistente/);
 delete p.motionV2.moves["e".repeat(32)];
 p.motionV2.moves[id].path[1].out=[10000,0];
 assert.throws(()=>validateEditorProject(p),/Bézier/);
});
test("motion preflight reports background diversity and spatial entrances",()=>{
 const p=project(),qa=auditMotionV2(p);
 assert.equal(qa.summary.animatedLayers,1);
 assert.ok(qa.summary.backgroundChanges>=1);
 assert.equal(qa.summary.offscreenEntrances,1);
 assert.ok(qa.samples.length>0);
 assert.equal(qa.passed,true);
});
test("existing visual editor exposes controls and authenticated QA route",()=>{
 const html=read("editor-studio/index.html");
 const ui=read("editor-studio/motion-v2.js");
 const router=read("src/editor-studio-http.mjs");
 assert.match(html,/\/editor\/motion-v2\.js/);
 assert.match(html,/\/editor\/motion-v2\.css/);
 assert.match(router,/pieces\[4\]==="motion-qa"/);
 for(const item of ["motionV2ApplyBackground","motionV2ApplyLayer","motionV2Bezier","motionV2AutoCompose","motionV2QA"]){
  assert.match(ui,new RegExp(item));
 }
 assert.doesNotThrow(()=>new Script(ui));
 assert.doesNotMatch(ui,/\/api\/editor\/projects\/.*\/render/);
});
