import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateMotionPlan, frameSeconds } from "../src/motion/plan.mjs";
import { buildMotionComposition } from "../src/motion/composer.mjs";
import { inspectMotionProject } from "../src/motion/preflight.mjs";
import { summarizeCheck } from "../src/renderers/hyperframes.mjs";
import { evaluateVideoProbe } from "../src/video-qa.mjs";
const fixture=JSON.parse(await readFile(new URL("../examples/motion/widget-study.json",import.meta.url),"utf8"));
const copy=()=>structuredClone(fixture);

test("frame plan compiles deterministically to editable scenes and the existing job contract",async()=>{
  const first=await buildMotionComposition(copy()), second=await buildMotionComposition(copy());
  assert.deepEqual(first,second);
  assert.equal(first.project.durationSeconds,12);
  assert.equal(first.readiness.renderReady,false);
  assert.equal(first.metadata.expectsAudio,false);
  assert.equal(first.projectFiles.filter(f=>f.path.startsWith("compositions/")).length,3);
});
test("rejects gaps, overlaps, out-of-range events and duplicate event ids",()=>{
  for(const mutate of [p=>p.scenes[1].startFrame++,p=>p.scenes[1].startFrame--,p=>p.scenes[0].events[0].endFrame=150,p=>p.scenes[1].events[0].id=p.scenes[0].events[0].id]) {
    const p=copy();mutate(p);assert.equal(validateMotionPlan(p).ok,false);
  }
});
test("rational FPS uses integer frames without accumulated drift",()=>{
  assert.equal(frameSeconds(30000,"30000/1001"),1001);
  const p=copy();p.fps="30000/1001";assert.equal(validateMotionPlan(p).ok,true);
});
test("sound design needs files, ownership and visible event anchors",async()=>{
  const p=copy();p.audioMode="sound-design";assert.equal(validateMotionPlan(p).ok,false);
  p.audioCues=[{id:"tap",src:"assets/tap.wav",role:"sfx",startFrame:245,endFrame:260,volume:.5,provenance:"Original recording",eventId:"progress-one"}];
  assert.equal(validateMotionPlan(p).ok,true);
  await assert.rejects(buildMotionComposition(p),/Missing asset/);
  p.audioCues[0].eventId="missing";assert.equal(validateMotionPlan(p).ok,false);
  p.audioCues[0].src="assets/../../secret.wav";assert.equal(validateMotionPlan(p).ok,false);
});
test("product scenes require supplied imagery and HTML text is escaped",async()=>{
  const p=copy();p.scenes[0].type="product";assert.equal(validateMotionPlan(p).ok,false);
  p.scenes[0].media="assets/product.svg";p.scenes[0].headline='</script><img onerror="alert(1)">';
  const result=await buildMotionComposition(p,[{path:"assets/product.svg",content:'<svg xmlns="http://www.w3.org/2000/svg"/>'}]);
  const scene=result.projectFiles.find(f=>f.path==="compositions/opening.html").content;
  assert.ok(!scene.includes('<img onerror="alert(1)">'));
  assert.ok(scene.includes("&lt;/script&gt;"));
});
test("collage uses supplied image layers and transitions retain the previous scene",async()=>{
  const p=copy();p.scenes[0].type="collage";p.scenes[0].media="assets/card.svg";
  const result=await buildMotionComposition(p,[{path:"assets/card.svg",content:'<svg xmlns="http://www.w3.org/2000/svg"/>'}]);
  const scene=result.projectFiles.find(f=>f.path==="compositions/opening.html").content;
  assert.equal((scene.match(/class="tile"/g)||[]).length,3);
  const root=result.projectFiles.find(f=>f.path==="index.html").content;
  assert.match(root,/data-composition-id="opening"[^>]*data-duration="3"/);
  assert.ok(scene.includes('data-duration="3"'));
});
test("worker validates packaged motion plans before invoking a renderer",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"mediaforge-motion-"));
  assert.equal(await inspectMotionProject(dir,{}),null);
  await writeFile(join(dir,"motion-plan.json"),JSON.stringify(fixture));
  const report=await inspectMotionProject(dir,{durationSeconds:12,fps:60});
  assert.equal(report.artisticReview,"pending");
  await assert.rejects(inspectMotionProject(dir,{durationSeconds:15,fps:60}),/differs/);
});
test("preflight summary reports actual findings instead of the truncated progress tail",()=>{
  assert.match(summarizeCheck(JSON.stringify({layout:{findings:[{severity:"error",code:"overflow",selector:"#title",message:"Text outside canvas"}]}})),/overflow: #title: Text outside canvas/);
  assert.equal(summarizeCheck("not-json"),"");
});
test("technical QA accepts rational frame rate, checks portrait dimensions and does not approve art",()=>{
  const data={format:{duration:"12"},streams:[{codec_type:"video",width:1080,height:1920,avg_frame_rate:"30000/1001"}]};
  const result=evaluateVideoProbe(data,{resolution:"portrait",fps:"30000/1001",durationSeconds:12});
  assert.equal(result.status,"passed");assert.equal(result.artisticReview,"pending");
  data.streams[0].width=720;assert.equal(evaluateVideoProbe(data,{resolution:"portrait",fps:"30000/1001",durationSeconds:12}).status,"failed");
});
