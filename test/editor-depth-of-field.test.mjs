import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {makeEditorProject,validateEditorProject} from "../src/editor-studio-core.mjs";
import {buildEditorIndex,buildEditorSceneModule} from "../src/editor-studio-engine.mjs";
import {applyEditorStylePreset,buildEditorStyleDna} from "../src/editor-style-presets.mjs";
import {VIDEOS_SECRETS_TOOLS} from "../src/videos-secrets-mcp.mjs";

const idea="Uma produção tridimensional com foco seletivo e câmera cinematográfica.";
test("depth of field is a per-scene 0–1 control and rejects out-of-range values",()=>{
 const p=makeEditorProject({idea,duration_seconds:15,scenes:[
  {headline:"Primeiro plano",depthOfField:.35,duration_seconds:5},
  {headline:"Plano central",depthOfField:.8,duration_seconds:5},
  {headline:"Plano final",depthOfField:0,duration_seconds:5}
 ]});
 assert.equal(p.scenes[0].depthOfField,.35);
 assert.equal(p.scenes[1].depthOfField,.8);
 assert.equal(p.scenes[2].depthOfField,0);
 assert.equal(validateEditorProject(p),p);
 for(const value of [-.01,1.01,NaN]){
  p.scenes[0].depthOfField=value;
  assert.throws(()=>validateEditorProject(p),e=>e.code==="SCENE_DOF_INVALID");
 }
});
test("generated Three.js composition uses a real depth texture and a frame-seekable DOF pass",()=>{
 const p=makeEditorProject({idea,duration_seconds:15});
 p.scenes[0].depthOfField=.62;p.scenes[1].depthOfField=.84;
 const html=buildEditorIndex(p);
 assert.match(html,/data-composition-id="main"/);
 const module=buildEditorSceneModule(p);
 for(const token of ["THREE.DepthTexture","THREE.DepthFormat","depthTexture","dofScene","dofMaterial",
   "linearDistance","uFocusDistance","uFocusRange","uMaxRadiusPixels","depthOfField","hf-seek"])
   assert.ok(module.includes(token),"missing "+token);
 assert.match(module,/"depthOfField":0\.62/);
 assert.match(module,/"depthOfField":0\.84/);
});
test("depth of field is retained by all style presets and exported Style DNA",()=>{
 const p=makeEditorProject({idea,duration_seconds:15});
 for(const style of ["apple-clean","spotify-dark-glow","motivational-bw"]){
  const next=applyEditorStylePreset(p,style);
  assert.ok(next.scenes.every(s=>s.depthOfField>=0&&s.depthOfField<=1));
  const dna=buildEditorStyleDna(next);
  assert.equal(dna.sceneStyle[0].depthOfField,next.scenes[0].depthOfField);
 }
});
test("editor exposes a per-scene 0–100% DOF slider and MCP accepts depthOfField",async()=>{
 const html=await readFile(new URL("../editor-studio/index.html",import.meta.url),"utf8");
 const app=await readFile(new URL("../editor-studio/app.js",import.meta.url),"utf8");
 assert.match(html,/id="editDepthOfField"[^>]*min="0" max="100"/);
 assert.match(app,/editDepthOfField:"depthOfField"/);
 const create=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="create_editor_project");
 const edit=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="edit_editor_project");
 assert.ok(create.inputSchema.properties.scenes.items.properties.depthOfField);
 assert.equal(edit.inputSchema.properties.edits.items.properties.changes.properties.depthOfField.maximum,1);
});
