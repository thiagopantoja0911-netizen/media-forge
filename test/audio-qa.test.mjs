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
