import test from "node:test";
import assert from "node:assert/strict";
import { validateMotionPlan } from "../src/motion/plan.mjs";
import { buildMotionComposition } from "../src/motion/composer.mjs";

function cinematicFixture() {
  const scenes=[];
  const lengths=[150,150,180,180,180,180,180,150];
  const kinds=["footage","footage","photo","footage","product","footage","photo","footage"];
  const transition=["cut","whip","cut","dip","match-cut","whip","cut","dip"];
  let start=0;
  for(let i=0;i<lengths.length;i++){
    const frames=lengths[i],type=kinds[i];
    const ext=type==="footage"?"mp4":"jpg";
    scenes.push({
      id:"shot-"+(i+1),type,
      startFrame:start,endFrame:start+frames,
      headline:"Cena "+(i+1)+" com ação",
      detail:"Uma informação causa a próxima",
      media:"assets/shot-"+(i+1)+"."+ext,
      camera:i%2?"truck-left":"dolly-in",
      transition:transition[i],
      events:[
        {id:"enter-"+(i+1),action:"enter",startFrame:0,peakFrame:12,endFrame:20},
        {id:"camera-"+(i+1),action:"camera",startFrame:25,peakFrame:45,endFrame:Math.min(120,frames-5)}
      ]
    });
    start+=frames;
  }
  const cues=[
    {id:"voice",role:"voice",src:"assets/voice.mp3",startFrame:0,endFrame:1170,volume:1,provenance:"Own narration"},
    {id:"music",role:"music",src:"assets/score.wav",startFrame:0,endFrame:1350,volume:.7,provenance:"Original licensed score"},
    {id:"sweep",role:"sfx",src:"assets/sweep.wav",startFrame:45,endFrame:60,volume:.5,provenance:"Licensed recording",eventId:"camera-1"},
    {id:"impact",role:"sfx",src:"assets/impact.wav",startFrame:525,endFrame:540,volume:.5,provenance:"Licensed recording",eventId:"camera-4"}
  ];
  return {format:"mediaforge-motion-v1",productionMode:"cinematic",title:"Ação é essencial",
    width:1080,height:1920,fps:30,totalFrames:1350,audioMode:"voice-led",
    palette:{ground:"#080c12",ink:"#f4f0ea",accent:"#e9a16c",paper:"#ffffff"},
    scenes,audioCues:cues};
}
function filesFor(plan){
  const paths=new Set([...plan.scenes.map(s=>s.media),...plan.audioCues.map(c=>c.src)]);
  return [...paths].map(path=>({path,contentBase64:Buffer.from("asset fixture data "+path).toString("base64")}));
}
test("cinematic gate accepts varied moving footage, camera direction and real sound cues",()=>{
  const review=validateMotionPlan(cinematicFixture());
  assert.equal(review.ok,true,review.errors.join("; "));
  assert.ok(review.cinematicCraft.footagePct>=30);
  assert.ok(review.cinematicCraft.sfxCount>=2);
});
test("cinematic gate blocks slide decks, silent timelines, missing soundtrack and fake impact positions",()=>{
  const p=cinematicFixture();
  p.audioCues=p.audioCues.filter(c=>c.role!=="music");
  assert.match(validateMotionPlan(p).errors.join(" "),/music stem/);
  const p2=cinematicFixture();
  p2.scenes[1].media=p2.scenes[0].media;
  assert.match(validateMotionPlan(p2).errors.join(" "),/repeated consecutive/);
  const p3=cinematicFixture();
  p3.scenes[0].type="photo";p3.scenes[0].media="assets/shot-0.jpg";
  for(let i=1;i<p3.scenes.length;i++){p3.scenes[i].type="photo";p3.scenes[i].media="assets/shot-"+i+".jpg";}
  assert.match(validateMotionPlan(p3).errors.join(" "),/moving footage/);
  const p4=cinematicFixture();p4.audioCues.find(c=>c.id==="sweep").startFrame=70;
  assert.match(validateMotionPlan(p4).errors.join(" "),/80ms/);
  const p5=cinematicFixture();p5.audioMode="silent-study";p5.audioCues=[];
  assert.match(validateMotionPlan(p5).errors.join(" "),/silently fall back/);
});
test("media-first composer produces full-bleed scenes, visible movement and separate balanced stems",async()=>{
  const p=cinematicFixture();
  const result=await buildMotionComposition(p,filesFor(p));
  assert.equal(result.readiness.testRenderReady,true);
  assert.equal(result.readiness.renderReady,false);
  assert.equal(result.metadata.productionMode,"cinematic");
  const video=result.projectFiles.find(f=>f.path==="compositions/shot-1.html").content;
  const photo=result.projectFiles.find(f=>f.path==="compositions/shot-3.html").content;
  assert.match(video,/class="media-stage"/);
  assert.match(video,/<video id="shot-1-source" class="clip"/);
  assert.match(video,/#shot-1-camera-rig/);
  assert.match(photo,/<img id="shot-3-source"/);
  assert.match(photo,/media-first/);
  const root=result.projectFiles.find(f=>f.path==="index.html").content;
  assert.match(root,/data-volume="0.16"/);
  assert.match(root,/id="audio-voice"/);
  assert.match(root,/id="audio-sweep"/);
  assert.match(root,/data-fade-out="0.8"/);
});
test("cinematic compiler rejects external or missing media and SFX assets",async()=>{
  const p=cinematicFixture(), f=filesFor(p);
  await assert.rejects(buildMotionComposition(p,f.filter(v=>!v.path.endsWith("impact.wav"))),/Missing asset/);
  p.scenes[0].media="https://example.com/movie.mp4";
  assert.equal(validateMotionPlan(p).ok,false);
});
