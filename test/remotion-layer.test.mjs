import test from "node:test";
import assert from "node:assert/strict";
import {demoProject,validateLayerProject} from "../remotion/project.mjs";
test("Stage 1 contains video image and text with simultaneous overlap",()=>{
  const p=validateLayerProject(demoProject);
  assert.equal(p.width/p.height,9/16);assert.equal(p.durationInFrames/p.fps,12);
  const kinds=p.layers.map(l=>l.type);
  assert.deepEqual(kinds,["video","image","text"]);
  for(let frame of [0,100,200,359])assert.equal(p.layers.filter(l=>l.startFrame<=frame&&frame<l.endFrame).length,3);
});
test("Bad file paths and nonmonotonic keyframes are rejected",()=>{
  const p=structuredClone(demoProject);p.layers[0].src="../../secrets";assert.throws(()=>validateLayerProject(p));
  const q=structuredClone(demoProject);q.layers[2].keyframes=[{frame:5},{frame:5}];assert.throws(()=>validateLayerProject(q));
});
