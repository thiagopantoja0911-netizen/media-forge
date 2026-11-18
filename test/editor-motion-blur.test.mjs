import test from "node:test";
import assert from "node:assert/strict";
import { temporalShutterSamples } from "../src/editor-motion-blur.mjs";
import { makeEditorProject, validateEditorProject } from "../src/editor-studio-core.mjs";
import { buildEditorIndex, buildEditorSceneModule } from "../src/editor-studio-engine.mjs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";
import { buildEditorStyleDna } from "../src/editor-style-presets.mjs";

test("motion blur disabled is single-sample; enabled is symmetric and independent of request history",()=>{
 const scene={startFrame:0,endFrame:300,motionBlur:0};
 assert.deepEqual(temporalShutterSamples(scene,1,30),[1]);
 scene.motionBlur=.8;
 const a=temporalShutterSamples(scene,1,30),b=temporalShutterSamples(scene,1,30);
 assert.deepEqual(a,b);assert.equal(a.length,5);
 assert.ok(a[0]<1&&a.at(-1)>1);
 assert.ok(a.every(t=>t>=0&&t<10));
 assert.ok(Math.abs(a.reduce((x,y)=>x+y,0)/a.length-1)<1e-7);
 assert.equal(temporalShutterSamples(scene,1,30,true).length,3);
});
test("samples never bleed into adjacent shots even near a hard cut",()=>{
 const scene={startFrame:60,endFrame:120,motionBlur:1};
 assert.ok(temporalShutterSamples(scene,2,30).every(t=>t>=2));
 assert.ok(temporalShutterSamples(scene,3.9999,30).every(t=>t<4));
});
test("editor scene embeds deterministic temporal accumulation and removes duplicate fake HyperFrames blur",()=>{
 const project=makeEditorProject({idea:"Produção de um anúncio com câmera e cartões tridimensionais.",duration_seconds:12});
 project.scenes[0].motionBlur=.7;
 validateEditorProject(project);
 const html=buildEditorIndex(project);
 assert.match(html,/data-motion-blur="off"/);
 const js=buildEditorSceneModule(project);
 for(const fragment of ["WebGLRenderTarget","AdditiveBlending","accumulationTarget","temporalShutterSamples","hf-seek"])
   assert.ok(js.includes(fragment),fragment);
 const dna=buildEditorStyleDna(project);
 assert.equal(dna.sceneStyle[0].motionBlur,.7);
 const editor=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="edit_editor_project");
 assert.equal(editor.inputSchema.properties.edits.items.properties.changes.properties.motionBlur.maximum,1);
});
test("scene validation rejects invalid blur intensity",()=>{
 const project=makeEditorProject({idea:"Preparar projeto de teste para motion blur temporal.",duration_seconds:12});
 project.scenes[0].motionBlur=2;
 assert.throws(()=>validateEditorProject(project),e=>e.code==="SCENE_MOTION_BLUR_INVALID");
});
