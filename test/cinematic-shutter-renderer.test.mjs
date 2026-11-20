import test from "node:test";
import assert from "node:assert/strict";
import {renderArgs} from "../src/renderers/hyperframes.mjs";

test("cinematic V2 requires the validated local HyperFrames shutter renderer",()=>{
 const prior=process.env.HYPERFRAMES_BIN;
 try{
  process.env.HYPERFRAMES_BIN="C:\\MediaForge-HyperFrames\\releases\\validated\\hyperframes.cmd";
  const args=renderArgs({project:{resolution:"portrait",fps:30,quality:"high"},
   metadata:{kind:"cinematic-3d",motionBlur:{enabled:true,shutterAngle:180,maxStrength:.8}}},"C:\\temp\\test.mp4");
  assert.ok(args.includes("--cinematic-motion-blur"));
  const v2=renderArgs({project:{resolution:"portrait",fps:30,quality:"high"},metadata:{productionMode:"cinematic",cinematicPolicyVersion:"v2"}},"out.mp4");
  assert.ok(v2.includes("--cinematic-motion-blur"),"all V2 jobs need the real shutter, not only 3D");
  delete process.env.HYPERFRAMES_BIN;
  assert.throws(()=>renderArgs({project:{},metadata:{kind:"cinematic-3d",motionBlur:{enabled:true}}},"out.mp4"),/validated local HyperFrames fork/);
 }finally{
  if(prior===undefined)delete process.env.HYPERFRAMES_BIN;else process.env.HYPERFRAMES_BIN=prior;
 }
});
