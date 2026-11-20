import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAudioLoudness } from "../src/video-qa.mjs";

test("cinematic audio QA validates integrated loudness and true peak",()=>{
  const good=evaluateAudioLoudness({integratedLufs:-15.98,truePeakDb:-1.97});
  assert.equal(good.status,"passed");
  assert.equal(good.integratedLufs,-15.98);
  assert.equal(good.truePeakDb,-1.97);
  assert.equal(evaluateAudioLoudness({integratedLufs:-26.4,truePeakDb:-8}).status,"failed");
  assert.equal(evaluateAudioLoudness({integratedLufs:-8.5,truePeakDb:-.2}).status,"failed");
  assert.match(evaluateAudioLoudness({integratedLufs:-8.5,truePeakDb:-.2}).issues.join(" "),/pico|Pico/);
});
test("audio QA never approves unmeasurable sound",()=>{
  assert.equal(evaluateAudioLoudness({integratedLufs:NaN,truePeakDb:NaN}).status,"failed");
  assert.equal(evaluateAudioLoudness().status,"failed");
});

test("silence inspection flags long gaps without treating deliberate pauses as codec failures",()=>{
  const x=evaluateAudioLoudness({integratedLufs:-16,truePeakDb:-1.8,
    silenceSegments:[{startSeconds:9,endSeconds:12,durationSeconds:3}]});
  assert.equal(x.status,"passed");
  assert.equal(x.silenceSegments.length,1);
  assert.match(x.warnings.join("; "),/Silêncios maiores que 2s/);
});

test("audio QA blocks clipped samples and near-zero sample peaks",()=>{
 const clipped=evaluateAudioLoudness({integratedLufs:-15,truePeakDb:-1.2,clippedSamples:12});
 assert.equal(clipped.status,"failed");
 assert.match(clipped.issues.join(" "),/amostras clipadas/);
 const hot=evaluateAudioLoudness({integratedLufs:-15,truePeakDb:-1.2,maxVolumeDb:-.01});
 assert.equal(hot.status,"failed");
 assert.match(hot.issues.join(" "),/clipping/);
});
test("audio QA warns when the integrated loudness misses the social delivery target",()=>{
 const result=evaluateAudioLoudness({integratedLufs:-18,truePeakDb:-1.5});
 assert.equal(result.status,"passed");
 assert.match(result.warnings.join(" "),/meta de publicação/);
});
