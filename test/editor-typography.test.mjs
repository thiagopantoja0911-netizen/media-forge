import test from "node:test";
import assert from "node:assert/strict";
import {makeEditorProject,validateEditorProject} from "../src/editor-studio-core.mjs";
import {DEFAULT_TYPOGRAPHY,renderKineticTitle,validateSceneTypography} from "../src/editor-typography.mjs";
import {buildEditorIndex,buildEditorSceneModule} from "../src/editor-studio-engine.mjs";
import {applyEditorStylePreset,buildEditorStyleDna} from "../src/editor-style-presets.mjs";
import {VIDEOS_SECRETS_TOOLS} from "../src/videos-secrets-mcp.mjs";

const idea="Crie um vídeo minimalista com palavras que aparecem no ritmo visual.";
const settings={mode:"words",family:"sans",weightFrom:300,weightTo:800,bloom:.55,bloomColor:"#aaffcc",stagger:.7};
test("kinetic title escapes hostile HTML and preserves spaces",()=>{
 const output=renderKineticTitle("Faça <mais> agora!",settings);
 assert.match(output,/data-motion-index="0"/);
 assert.match(output,/&lt;mais&gt;/);
 assert.doesNotMatch(output,/<mais>/);
 assert.equal((output.match(/class="kinetic-unit"/g)||[]).length,3);
 assert.equal(renderKineticTitle("A & B",DEFAULT_TYPOGRAPHY),"A &amp; B");
});
test("letter segmentation preserves emoji graphemes, accented words and whitespace",()=>{
 const s={...settings,mode:"letters"};
 const output=renderKineticTitle("AÇÃO 👩🏽‍🚀",s);
 const count=(output.match(/class="kinetic-unit"/g)||[]).length;
 assert.equal(count,5);
 assert.ok(output.includes("👩🏽‍🚀"));
 assert.ok(!output.includes("<script>"));
});
test("validated typography persists on an editable scene and rejects unsafe font options",()=>{
 const p=makeEditorProject({idea,duration_seconds:15,scenes:[
  {headline:"Uma ideia",typography:settings,duration_seconds:5},
  {headline:"Uma escolha",duration_seconds:5},
  {headline:"Um resultado",duration_seconds:5}
 ]});
 assert.deepEqual(p.scenes[0].typography,settings);
 assert.equal(validateEditorProject(p),p);
 assert.ok(validateSceneTypography(settings));
 for(const invalid of [{...settings,family:"url(http://malicious)"},{...settings,bloom:5},{...settings,weightFrom:0}]){
   assert.equal(validateSceneTypography(invalid),false);
   p.scenes[1].typography=invalid;
   assert.throws(()=>validateEditorProject(p),e=>e.code==="SCENE_TYPOGRAPHY_INVALID");
 }
});
test("HTML and generated WebGL runtime implement deterministic per-unit animation and independently configurable glow",()=>{
 const p=makeEditorProject({idea,duration_seconds:15});
 p.scenes[0].typography={...settings,mode:"letters",family:"serif"};
 p.scenes[1].typography={...settings,mode:"words",bloom:0};
 const html=buildEditorIndex(p);
 assert.match(html,/kinetic-unit/);
 assert.match(html,/aria-label/);
 assert.match(html,/Georgia,Times New Roman,serif/);
 const js=buildEditorSceneModule(p);
 assert.match(js,/function updateTypography/);
 assert.match(js,/typ\.bloomColor/);
 assert.match(js,/typ\.weightFrom/);
 assert.match(js,/typ\.stagger/);
 assert.match(js,/hf-seek/);
});
test("all three native style presets configure kinetic typography; DNA preserves it",()=>{
 const p=makeEditorProject({idea,duration_seconds:15});
 for(const style of ["apple-clean","spotify-dark-glow","motivational-bw"]){
   const r=applyEditorStylePreset(p,style);
   assert.ok(["words","letters"].includes(r.scenes[0].typography.mode));
   assert.equal(validateEditorProject(r),r);
   const dna=buildEditorStyleDna(r);
   assert.equal(dna.sceneStyle[0].typography.mode,r.scenes[0].typography.mode);
 }
 const tool=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="edit_editor_project");
 assert.ok(tool.inputSchema.properties.edits.items.properties.changes.properties.typography);
});
