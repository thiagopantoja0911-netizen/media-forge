import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildHomologationAudio,createEditorHomologationProject} from "../src/editor-homologation.mjs";
import {analyzePcmForBeats,synchronizeSceneCutsToBeats} from "../src/editor-beat-sync.mjs";
import {loadEditorProject,validateEditorProject,editorStoreDir} from "../src/editor-studio-core.mjs";
import {buildEditorRenderFiles,buildEditorSceneModule} from "../src/editor-studio-engine.mjs";
import {handleEditorStudioHttp} from "../src/editor-studio-http.mjs";
import {VIDEOS_SECRETS_TOOLS} from "../src/videos-secrets-mcp.mjs";

const originalEnv=process.env.MEDIAFORGE_DATA_DIR;
const data=await mkdtemp(join(tmpdir(),"mediaforge-final-homologation-"));
process.env.MEDIAFORGE_DATA_DIR=data;
test.after(async()=>{
 if(originalEnv===undefined)delete process.env.MEDIAFORGE_DATA_DIR;
 else process.env.MEDIAFORGE_DATA_DIR=originalEnv;
 await rm(data,{recursive:true,force:true});
});

test("homologation generates a playable original 24-second mono PCM WAV at 120 BPM",()=>{
 const audio=buildHomologationAudio();
 assert.equal(audio.buffer.toString("ascii",0,4),"RIFF");
 assert.equal(audio.buffer.toString("ascii",8,12),"WAVE");
 assert.equal(audio.buffer.readUInt32LE(24),22050);
 assert.equal(audio.buffer.readUInt16LE(22),1);
 assert.equal(audio.buffer.readUInt32LE(40),audio.samples.length*2);
 assert.equal(audio.durationSeconds,24);
 assert.ok(audio.buffer.length>1_000_000&&audio.buffer.length<1_200_000);
 const analysis=analyzePcmForBeats(audio.samples,audio.sampleRate);
 assert.ok(Math.abs(analysis.bpm-120)<3,"BPM detectado: "+analysis.bpm);
});
test("homologation creates actual editable five-scene project, music and 4 separate SVG cards",async()=>{
 const result=await createEditorHomologationProject();
 const p=result.project;
 assert.equal(p.totalFrames,720);
 assert.equal(p.fps,30);
 assert.equal(p.scenes.length,5);
 assert.equal(p.assets.length,4);
 assert.equal(p.audio.length,1);
 assert.equal(p.audio[0].role,"music");
 assert.equal(p.audio[0].startFrame,0);
 assert.equal(p.audio[0].endFrame,720);
 assert.ok(p.scenes.every(s=>s.motionBlur>0));
 assert.ok(p.scenes.every(s=>s.depthOfField>0));
 assert.ok(p.scenes.every(s=>s.typography.mode==="letters"));
 assert.equal(p.scenes[1].visual.type,"card-grid");
 assert.equal(p.scenes[1].visual.columns*p.scenes[1].visual.rows,4);
 assert.equal(p.scenes[1].visual.assetIds.length,4);
 assert.match(result.editorUrl,new RegExp(p.id));
 assert.equal(validateEditorProject(p),p);
 assert.equal((await loadEditorProject(p.id)).id,p.id);
 const wav=await readFile(join(editorStoreDir(),p.id+"-audio-"+p.audio[0].assetId+".wav"));
 assert.equal(wav.toString("ascii",0,4),"RIFF");
 const files=await buildEditorRenderFiles(p);
 assert.ok(files.some(f=>f.path==="assets/style-dna.json"));
 assert.ok(files.filter(f=>f.path.startsWith("assets/images/")).length>=4);
 assert.match(files.find(f=>f.path==="index.html").content,/assets\/audio\//);
 const scene=buildEditorSceneModule(p);
 for(const value of ["depthOfField","motionBlur","card-grid","kinetic-unit","hf-seek"])
   assert.ok(scene.includes(value),"ausente no WebGL: "+value);
 const synced=synchronizeSceneCutsToBeats(p,analyzePcmForBeats(buildHomologationAudio().samples,22050),p.audio[0]);
 assert.equal(synced.project.totalFrames,720);
 assert.ok(synced.syncedCuts>=1,"Nenhum corte alinhado com BPM");
 assert.equal(validateEditorProject(synced.project),synced.project);
});

test("MCP exposes dedicated authenticated homologation builder",()=>{
 const tool=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="create_editor_homologation_project");
 assert.ok(tool);
 assert.deepEqual(tool.inputSchema.properties,{});
});
test("homologation creation endpoint is inaccessible without an admin session",async()=>{
 const request={url:"/api/editor/homologation",method:"POST",headers:{host:"studio.example",origin:"https://studio.example","sec-fetch-site":"same-origin"}};
 const response={status:null,body:null,writeHead(status){this.status=status;},end(body){this.body=body;}};
 const handled=await handleEditorStudioHttp({request,response,url:new URL("https://studio.example/api/editor/homologation"),
  isAdminSession:async()=>false,parseBody:async()=>({}),createJob:async()=>{throw Error("Must not render");},getJob:async()=>null});
 assert.equal(handled,true);
 assert.equal(response.status,401);
});
