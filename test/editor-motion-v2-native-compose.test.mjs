import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditMotionV2 } from "../src/editor-motion-v2.mjs";
const source=readFileSync(new URL("../editor-studio/motion-v2.js",import.meta.url),"utf8");
const engine=readFileSync(new URL("../src/editor-studio-engine.mjs",import.meta.url),"utf8");
test("3D WebGL canvas is composited above the animated background plane",()=>{
 assert.ok(engine.includes('"#world{position:absolute;inset:0;width:100%;height:100%;z-index:2;display:block}",'));
 assert.ok(engine.includes('"#motion-v2-bg{position:absolute;top:-9%;left:-9%;width:118%;height:118%;z-index:1;pointer-events:none;transform-origin:center center;will-change:transform,background}",'));
});
test("native auto-compose synchronizes editable title, kicker and support layers from scene data",()=>{
 assert.match(source,/title\.text=scene\.headline/);
 assert.match(source,/kicker\.text=scene\.kicker/);
 assert.match(source,/detail\.text=scene\.detail/);
 assert.match(source,/Kicker editável/);
 assert.match(source,/Apoio editável/);
});
test("native auto-compose uses longer eased entrances and exits plus Bézier paths",()=>{
 assert.match(source,/Math\.round\(p\.fps\*\.9\)/);
 assert.match(source,/ease:"cubic-out"/);
 assert.match(source,/ease:"cubic-in"/);
 assert.match(source,/move\.path=\[/);
 assert.match(source,/mask=i%3===0\?"wipe":"none"/);
});
test("36 layered 9:16 motion tracks pass Motion V2 preflight without speed spikes",()=>{
 const fps=30,totalFrames=1080,scenes=Array.from({length:12},(_,i)=>({id:"scene-"+i,startFrame:i*90,endFrame:(i+1)*90}));
 const palette=[
  ["#0B1220","#38D6C8","gradient"],["#0E1B2E","#F05AA6","rings"],["#12182C","#8A6CFF","grid"],
  ["#F4F7FB","#F4A340","gradient"],["#0B1824","#36A9FF","rings"],["#1D1820","#FF6C50","grid"],
  ["#F8F7FC","#C78BFF","gradient"],["#071B18","#48D1A0","rings"],["#1B1020","#F15C91","grid"],
  ["#101A36","#6E8BFF","gradient"],["#1A1B1D","#F0B45B","rings"],["#071B22","#38D6C8","grid"]
 ];
 const layers=[],moves={};
 scenes.forEach((scene,i)=>{
  const direction=i%2?"right":"left",opposite=i%2?"left":"right",fr=27;
  const title={id:"title"+i,startFrame:scene.startFrame,endFrame:scene.endFrame,width:940,height:422};
  const kicker={id:"kicker"+i,startFrame:scene.startFrame+3,endFrame:scene.endFrame-2,width:864,height:144};
  const detail={id:"detail"+i,startFrame:scene.startFrame+7,endFrame:scene.endFrame-4,width:864,height:230};
  layers.push(title,kicker,detail);
  moves[title.id]={enter:{from:direction,frames:fr,ease:"cubic-out",mask:i%3===0?"wipe":"none"},
   exit:{to:opposite,frames:fr,ease:"cubic-in",mask:i%3===0?"wipe":"none"},
   path:[{frame:title.startFrame,x:0,y:0,out:[18,-14]},
    {frame:title.startFrame+45,x:i%2?-28:28,y:-18,in:[-16,10],out:[16,-8],ease:[.42,0,.58,1]},
    {frame:title.endFrame,x:0,y:0,in:[-18,12],ease:"ease-in-out"}]};
  moves[kicker.id]={enter:{from:"top",frames:fr,ease:"cubic-out",mask:"none"},exit:{to:"top",frames:fr,ease:"cubic-in",mask:"none"}};
  moves[detail.id]={enter:{from:"bottom",frames:fr,ease:"cubic-out",mask:"none"},exit:{to:"bottom",frames:fr,ease:"cubic-in",mask:"none"}};
 });
 const background={keyframes:scenes.map((scene,i)=>({frame:scene.startFrame,color:palette[i][0],accent:palette[i][1],pattern:palette[i][2],panX:i%2?-8:8,panY:i%3===0?-5:5,zoom:1.06,ease:[.22,1,.36,1]}))};
 const qa=auditMotionV2({id:"a".repeat(32),fps,aspectRatio:"9:16",totalFrames,scenes,layers,motionV2:{version:1,enabled:true,hideSceneTitles:true,background,moves}});
 assert.equal(qa.summary.animatedLayers,36);
 assert.equal(qa.summary.backgroundChanges,11);
 assert.equal(qa.summary.offscreenEntrances,36);
 assert.equal(qa.summary.offscreenExits,36);
 assert.equal(qa.summary.motionSpikes,0);
 assert.equal(qa.passed,true);
 assert.equal(qa.issues.filter(x=>x.code==="MOTION_SPIKE").length,0);
});
