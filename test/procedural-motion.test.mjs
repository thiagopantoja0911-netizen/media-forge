import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateMotionPlan } from "../src/motion/plan.mjs";
import { inspectMotionProject } from "../src/motion/preflight.mjs";
import { buildMotionComposition } from "../src/motion/composer.mjs";

const makePlan=()=>{
 const chapters=["hook","rhythm","depth","signature"];
 const scenes=chapters.map((name,i)=>({
  id:name,type:i===3?"end-card":"kinetic",
  startFrame:i*150,endFrame:(i+1)*150,
  headline:["NÃO É UM SLIDE","É RITMO","É PROFUNDIDADE","É MOTION"][i],
  transition:["cut","match-cut","whip","iris"][i],
  events:[
   {id:name+"-enter",action:"enter",startFrame:0,peakFrame:12,endFrame:25},
   {id:name+"-focus",action:"focus",startFrame:30,peakFrame:65,endFrame:115},
   {id:name+"-exit",action:"exit",startFrame:117,peakFrame:145,endFrame:149}
  ]
 }));
 return {
  format:"mediaforge-motion-v1",profile:"dynamic-motion-v1",
  visualMode:"procedural-motion",productionMode:"cinematic",
  title:"Câmera, composição e continuidade",intent:"Showcase vertical original de motion 3D",
  width:1080,height:1920,fps:60,totalFrames:600,durationSeconds:10,audioMode:"sound-design",
  scenes,layers:[
   {id:"world",role:"background",depth:.2,movement:"grid move"},
   {id:"sculpture",role:"midground",depth:1,movement:"3D sculpture orbit"},
   {id:"foreground",role:"foreground",depth:1.8,movement:"independent parallax"}
  ],
  beats:chapters.map((name,i)=>({start:i*2.5,end:(i+1)*2.5,
    action:name,stateBefore:name+"-start",stateAfter:name+"-end"})),
  events:[
   ...chapters.map((name,i)=>({id:"cam-"+name,start:i*2.5,duration:2.45,scope:"camera",kind:"dolly",target:"#camera"})),
   ...chapters.map((name,i)=>({id:"scene-"+name,start:i*2.5,duration:2.45,scope:"scene",kind:"3d-rotate",target:"#sculpture"})),
   ...chapters.map((name,i)=>({id:"front-"+name,start:i*2.5,duration:2.45,scope:"foreground",kind:"parallax",target:"#foreground"})),
   ...chapters.map((name,i)=>({id:"type-"+name,start:i*2.5,duration:2.45,scope:"ui",kind:"kinetic",target:"#w"+i}))
  ],
  transitions:[2.2,4.7,7.2].map((at,i)=>({at,duration:.3,kind:"object-wipe",carrier:"#portal",
    cause:"physical object fills lens",fromState:"world-"+i,toState:"world-"+(i+1)})),
  holds:[{start:9,end:10,reason:"closing title is readable"}],
  audioCues:[
   {id:"score",role:"music",src:"assets/music.wav",startFrame:0,endFrame:600,volume:.7,provenance:"Original sound"},
   {id:"whoosh",role:"sfx",src:"assets/whoosh.wav",startFrame:145,endFrame:165,volume:.6,provenance:"Original sound",eventId:"hook-exit"},
   {id:"impact",role:"sfx",src:"assets/impact.wav",startFrame:295,endFrame:315,volume:.6,provenance:"Original sound",eventId:"rhythm-exit"}
  ]
 };
};
const html=`<!doctype html><html><body><div id="camera"></div><div id="sculpture"></div>
<div id="foreground"></div><div id="w0"></div><div id="w1"></div><div id="w2"></div>
<div id="w3"></div><div id="portal"></div><script src="assets/gsap.min.js"></script><script>
window.__timelines = {};const tl=gsap.timeline({paused:true});
tl.fromTo("#camera",{x:0},{x:100,duration:2});
tl.to("#sculpture",{rotation:100,duration:2});
tl.to("#foreground",{x:200,duration:2});
window.__timelines.main=tl;</script></body></html>`;
async function project(plan, source=html) {
 const dir=await mkdtemp(join(tmpdir(),"mediaforge-procedural-"));
 await mkdir(join(dir,"assets"));
 await writeFile(join(dir,"motion-plan.json"),JSON.stringify(plan));
 await writeFile(join(dir,"index.html"),source);
 await writeFile(join(dir,"assets","gsap.min.js"),"/* gsap 3 licensed */".padEnd(75000,"."));
 for(const f of ["music.wav","whoosh.wav","impact.wav"])await writeFile(join(dir,"assets",f),"RIFFtestWAVEdata");
 return dir;
}

test("cinematic procedural motion passes with real dynamic plan, no artificial footage",()=>{
 const p=makePlan(),r=validateMotionPlan(p);
 assert.equal(r.ok,true,r.errors.join("; "));
 assert.equal(r.cinematicCraft.visualMode,"procedural-motion");
 assert.equal(r.cinematicCraft.footagePct,0);
 assert.ok(r.cinematicCraft.motionPct>=75);
});
test("media-first cinematic footage requirement is unchanged",()=>{
 const p=makePlan();delete p.visualMode;
 assert.match(validateMotionPlan(p).errors.join(" "),/30% actual moving footage/);
});
test("missing profile, camera, independent depth or sound still blocks cinema",()=>{
 for(const mutate of [
  p=>{p.profile="study"},
  p=>{p.layers.pop()},
  p=>{p.events=p.events.filter(e=>e.scope!=="camera")},
  p=>{p.audioCues=p.audioCues.filter(e=>e.role!=="music")}
 ]){const p=makePlan();mutate(p);assert.equal(validateMotionPlan(p).ok,false);}
});
test("source gate rejects fake source manifests and missing GSAP tweens",async()=>{
 const p=makePlan(),dir=await project(p);
 const ok=await inspectMotionProject(dir,{durationSeconds:10,fps:60});
 assert.equal(ok.productionMode,"cinematic");
 const bad=await project(p,html.replace('tl.to("#foreground",{x:200,duration:2});',""));
 await assert.rejects(inspectMotionProject(bad,{durationSeconds:10,fps:60}),/source gate failed/);
});
test("template composer will not claim bespoke procedural animation",async()=>{
 await assert.rejects(buildMotionComposition(makePlan()),/real authored index.html/);
});
