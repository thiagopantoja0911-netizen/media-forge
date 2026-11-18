import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {makeEditorProject,saveEditorProject,validateEditorProject} from "../src/editor-studio-core.mjs";
import {listEditorStylePresets,applyEditorStylePreset,buildEditorStyleDna} from "../src/editor-style-presets.mjs";
import {validateEditorVisualBytes,storeEditorVisualAsset,loadEditorVisualAsset,buildEditorVisualAssets} from "../src/editor-visual-assets.mjs";
import {buildEditorSceneModule,buildEditorRenderFiles} from "../src/editor-studio-engine.mjs";
import {VIDEOS_SECRETS_TOOLS} from "../src/videos-secrets-mcp.mjs";

const before=process.env.MEDIAFORGE_DATA_DIR;
const tmp=await mkdtemp(join(tmpdir(),"mediaforge-premium-"));
process.env.MEDIAFORGE_DATA_DIR=tmp;
test.after(async()=>{
 if(before===undefined)delete process.env.MEDIAFORGE_DATA_DIR;
 else process.env.MEDIAFORGE_DATA_DIR=before;
 await rm(tmp,{recursive:true,force:true});
});
const idea="Produzir um anúncio moderno de produto com luz orgânica e mockups UI.";
const basic=()=>makeEditorProject({idea,duration_seconds:30,scenes:[
 {kicker:"HOOK",headline:"Design que se move",duration_seconds:10},
 {kicker:"DEMO",headline:"Tela em perspectiva",duration_seconds:10},
 {kicker:"CTA",headline:"Experimente agora",duration_seconds:10}
]});
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/DKsAAAAASUVORK5CYII=","base64");
test("native presets apply consistent palette, camera and glow without replacing script",()=>{
 const named=listEditorStylePresets().map(v=>v.id);
 assert.deepEqual(named,["apple-clean","spotify-dark-glow","motivational-bw"]);
 const project=basic(),styled=applyEditorStylePreset(project,"spotify-dark-glow");
 assert.equal(styled.scenes[0].headline,"Design que se move");
 assert.equal(styled.scenes[0].glow.color,"#8754f6");
 assert.equal(styled.scenes[0].camera,"arc");
 assert.equal(styled.stylePreset,"spotify-dark-glow");
 assert.equal(validateEditorProject(styled),styled);
 assert.throws(()=>applyEditorStylePreset(project,"unknown"),e=>e.code==="EDITOR_STYLE_PRESET_INVALID");
});
test("visual image formats and insecure SVG references are checked before persistence",()=>{
 assert.equal(validateEditorVisualBytes(png,"png"),"image/png");
 assert.throws(()=>validateEditorVisualBytes(Buffer.from("not a png".repeat(9)),"png"),e=>e.code==="VISUAL_ASSET_FORMAT_INVALID");
 const safe=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100" height="100"/></svg>');
 assert.equal(validateEditorVisualBytes(safe,"svg"),"image/svg+xml");
 for(const malicious of ['<svg><script>alert(1)</script></svg>','<svg><image href="https://example.com/img.png"/></svg>',
  '<svg onload="alert(1)"><rect/></svg>']){
  assert.throws(()=>validateEditorVisualBytes(Buffer.from(malicious.padEnd(60," ")),"svg"),
    e=>e.code==="VISUAL_ASSET_SVG_UNSAFE");
 }
});
test("upload asset then compose screen, card grid, glow; preview and render use same asset",async()=>{
 const p=await saveEditorProject(basic());
 const {project,asset}=await storeEditorVisualAsset(p,{filename:"demo.png",base64:png.toString("base64")});
 assert.equal(project.revision,p.revision+1);
 assert.equal(project.assets.length,1);
 const loaded=await loadEditorVisualAsset(project,asset.id);
 assert.ok(loaded.bytes.equals(png));
 const next=structuredClone(project);
 next.scenes[0].visual={type:"screen",assetId:asset.id,
   position:[0,.25,.5],rotation:[0,24,0],scale:1.2,depth:.6};
 next.scenes[1].visual={type:"card-grid",assetId:asset.id,
   position:[0,0,0],rotation:[0,-15,0],scale:.65,depth:.7,columns:3,rows:4,scroll:1.3};
 next.scenes[1].glow={color:"#dd55ff",intensity:.8,speed:1.2,x:0,y:.2};
 assert.equal(validateEditorProject(next),next);
 const preview=buildEditorSceneModule(next,{sceneIndex:1,preview:true});
 assert.match(preview,new RegExp("/api/editor/projects/"+next.id+"/assets/"+asset.id));
 assert.match(preview,/ShaderMaterial/);assert.match(preview,/card-grid/);
 const sceneFile=join(tmp,"premium-scene.mjs");
 await writeFile(sceneFile,preview);
 const check=spawnSync(process.execPath,["--check",sceneFile],{encoding:"utf8"});
 assert.equal(check.status,0,check.stderr);
 const files=await buildEditorRenderFiles(next);
 assert.ok(files.some(f=>f.path==="assets/images/"+asset.id+".png"&&f.contentBase64===png.toString("base64")));
 assert.ok(files.some(f=>f.path==="assets/style-dna.json"));
 assert.ok(files.find(f=>f.path==="assets/scene.mjs").content.includes("assets/images/"+asset.id+".png"));
 assert.equal((await buildEditorVisualAssets(next,{sceneIndex:2})).length,0);
 const invalid=structuredClone(next);invalid.scenes[0].visual.assetId="0".repeat(32);
 assert.throws(()=>validateEditorProject(invalid),e=>e.code==="SCENE_VISUAL_INVALID");
});
test("style DNA captures palette, motion, camera, beats and layout without asset identifiers",()=>{
 const p=applyEditorStylePreset(basic(),"motivational-bw");
 const dna=buildEditorStyleDna(p);
 assert.equal(dna.format,"mediaforge-editor-style-dna-v1");
 assert.equal(dna.rhythmFrames.reduce((a,b)=>a+b,0),p.totalFrames);
 assert.equal(dna.cameraSignature.length,p.scenes.length);
 assert.ok(!JSON.stringify(dna).includes("base64"));
});
test("MCP exposes editor image upload, native presets and DNA",()=>{
 const byName=new Map(VIDEOS_SECRETS_TOOLS.map(t=>[t.name,t]));
 for(const name of ["upload_editor_asset","apply_editor_style_preset","get_editor_style_dna","list_editor_style_presets"])
   assert.ok(byName.has(name),name);
 assert.ok(byName.get("edit_editor_project").inputSchema.properties.edits.items.properties.changes.properties.visual);
});
