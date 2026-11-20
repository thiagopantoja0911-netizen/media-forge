import test from "node:test";
import assert from "node:assert/strict";
import {buildCinematicAudioFilterGraph} from "../src/cinematic-audio-mix.mjs";
import {makeCinematicV2Fixture} from "./fixtures/cinematic-v2-fixture.mjs";

test("cinematic master builds a real sidechain voice-ducked score with ambience and event SFX",()=>{
 const plan=makeCinematicV2Fixture();
 const graph=buildCinematicAudioFilterGraph(plan,"C:/MediaForge/project");
 assert.equal(graph.durationSeconds,45);
 assert.equal(graph.inputs.length,plan.audioCues.length);
 assert.match(graph.filterComplex,/sidechaincompress=threshold=0\.025:ratio=7:attack=20:release=260/);
 assert.match(graph.filterComplex,/amix=inputs=/);
 assert.match(graph.filterComplex,/adelay=/);
 assert.match(graph.filterComplex,/loudnorm=I=-15:TP=-1\.5:LRA=11/);
 assert.match(graph.filterComplex,/alimiter=limit=0\.841/);
});

test("cinematic audio mix refuses missing voice ducking, score, SFX and unsafe asset paths",()=>{
 const p=makeCinematicV2Fixture();
 p.audioMix.voiceDucking=false;
 assert.throws(()=>buildCinematicAudioFilterGraph(p,"C:/MediaForge/project"),/voice ducking/);
 p.audioMix.voiceDucking=true;
 p.audioCues=p.audioCues.filter(c=>c.role!=="music");
 assert.throws(()=>buildCinematicAudioFilterGraph(p,"C:/MediaForge/project"),/music\/ambience bed/);
 p.audioCues=makeCinematicV2Fixture().audioCues.filter(c=>c.role!=="sfx");
 assert.throws(()=>buildCinematicAudioFilterGraph(p,"C:/MediaForge/project"),/event SFX/);
 p.audioCues=makeCinematicV2Fixture().audioCues;
 p.audioCues[0].src="../outside.wav";
 assert.throws(()=>buildCinematicAudioFilterGraph(p,"C:/MediaForge/project"),/invalid cue/);
});
