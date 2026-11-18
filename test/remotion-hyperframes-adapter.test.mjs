import test from "node:test";
import assert from "node:assert/strict";
import {demoProject} from "../remotion/project.mjs";
import {buildHyperFramesHtml} from "../remotion/hyperframes-html.mjs";

test("builds the same Remotion project as a seekable three-layer HyperFrames composition",()=>{
  const html=buildHyperFramesHtml(demoProject);
  assert.match(html,/data-composition-id="mediaforge-remotion-stage1"/);
  assert.match(html,/data-width="540"/);
  assert.match(html,/data-height="960"/);
  assert.match(html,/data-fps="30"/);
  assert.match(html,/data-duration="12"/);
  assert.match(html,/src="\.\/assets\/background\.mp4"/);
  assert.match(html,/src="\.\/assets\/badge\.png"/);
  assert.match(html,/data-track-index="0"/);
  assert.match(html,/data-track-index="2"/);
  assert.match(html,/data-track-index="3"/);
  assert.match(html,/UMA IDEIA\./);
  assert.match(html,/TRÊS CAMADAS\./);
  assert.match(html,/window\.__timelines/);
  assert.match(html,/gsap\.timeline\(\{paused:true\}\)/);
  assert.match(html,/timeline\.to\(element,props,previous\.frame\/30\)/);
});

test("rejects unsafe element ids and asset paths before HTML serialization",()=>{
  const badId=structuredClone(demoProject);
  badId.layers[2].id='headline" onmouseover="alert(1)';
  assert.throws(()=>buildHyperFramesHtml(badId),/Unsafe HyperFrames element id/);
  const badPath=structuredClone(demoProject);
  badPath.layers[0].src="../../outside.mp4";
  assert.throws(()=>buildHyperFramesHtml(badPath),/Invalid asset path|Unsafe Remotion asset path/);
});
