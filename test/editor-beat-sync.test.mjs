import test from "node:test";
import assert from "node:assert/strict";
import {makeEditorProject,validateEditorProject} from "../src/editor-studio-core.mjs";
import {analyzePcmForBeats,synchronizeSceneCutsToBeats} from "../src/editor-beat-sync.mjs";
import {VIDEOS_SECRETS_TOOLS} from "../src/videos-secrets-mcp.mjs";

function clickTrack(bpm,duration=20,sampleRate=22050){
 const pcm=new Float32Array(Math.floor(duration*sampleRate));
 const interval=60/bpm;
 for(let beat=.13;beat<duration-.05;beat+=interval){
  const start=Math.floor(beat*sampleRate),length=Math.floor(.035*sampleRate);
  for(let i=0;i<length&&start+i<pcm.length;i++){
   const envelope=Math.exp(-i/(sampleRate*.008));
   pcm[start+i]+=.8*Math.sin(2*Math.PI*1100*i/sampleRate)*envelope;
  }
 }
 return pcm;
}
const idea="Vídeo de teste para sincronizar cortes com uma trilha musical.";

test("spectral-flux beat analysis detects a steady 120 BPM click track",()=>{
 const result=analyzePcmForBeats(clickTrack(120));
 assert.ok(Math.abs(result.bpm-120)<3,"BPM detectado: "+result.bpm);
 assert.ok(result.confidence>.035);
 assert.ok(result.beatTimes.length>=30);
 assert.ok(result.beatIntervalSeconds>.48&&result.beatIntervalSeconds<.52);
});
test("tempo estimation handles a slower 90 BPM track without confusing half/double tempo",()=>{
 const result=analyzePcmForBeats(clickTrack(90,24));
 assert.ok(Math.abs(result.bpm-90)<3,"BPM detectado: "+result.bpm);
 assert.ok(result.beatTimes.length>=30);
});
test("silence and too-short files fail with actionable analysis errors",()=>{
 assert.throws(()=>analyzePcmForBeats(new Float32Array(22050*8)),e=>e.code==="BEAT_AUDIO_SILENT");
 assert.throws(()=>analyzePcmForBeats(new Float32Array(22050*2)),e=>e.code==="BEAT_AUDIO_TOO_SHORT");
});
test("scene cuts snap to the detected beat grid while preserving total duration and minimum scene length",()=>{
 const project=makeEditorProject({idea,duration_seconds:20,fps:30,scenes:[
  {headline:"Abertura",duration_seconds:4.8},
  {headline:"Contexto",duration_seconds:5.3},
  {headline:"Mecanismo",duration_seconds:5.2},
  {headline:"Resultado",duration_seconds:4.7}
 ]});
 const analysis={bpm:120,confidence:.72,beatIntervalSeconds:.5,
  beatTimes:Array.from({length:40},(_,i)=>.13+i*.5)};
 const track={id:"a".repeat(32),assetId:"b".repeat(32),startFrame:0,endFrame:project.totalFrames};
 const result=synchronizeSceneCutsToBeats(project,analysis,track);
 assert.equal(result.project.totalFrames,project.totalFrames);
 assert.equal(result.syncedCuts,3);
 assert.equal(result.totalCuts,3);
 assert.ok(result.project.scenes.every(s=>s.endFrame-s.startFrame>=project.fps));
 const beatFrames=new Set(analysis.beatTimes.map(t=>Math.round(t*project.fps)));
 assert.ok(result.cutFrames.every(frame=>beatFrames.has(frame)));
 assert.equal(validateEditorProject(result.project),result.project);
 assert.equal(result.project.beatSync.bpm,120);
});
test("beat sync rejects a grid that cannot align any cut without changing the scene structure",()=>{
 const project=makeEditorProject({idea,duration_seconds:15,fps:30});
 const analysis={bpm:120,confidence:.7,beatIntervalSeconds:.5,beatTimes:[.1,.6,1.1,1.6]};
 const track={id:"a".repeat(32),assetId:"b".repeat(32),startFrame:0,endFrame:30};
 assert.throws(()=>synchronizeSceneCutsToBeats(project,analysis,track),e=>e.code==="BEAT_SYNC_NO_CUTS");
});

test("editor MCP exposes a scoped beat-sync operation for Chrome/Claude agents",()=>{
 const tool=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="sync_editor_beats");
 assert.ok(tool);
 assert.ok(tool.inputSchema.properties.project_id);
 assert.ok(tool.inputSchema.properties.audio_id);
 assert.deepEqual(tool.inputSchema.required,["project_id"]);
});
