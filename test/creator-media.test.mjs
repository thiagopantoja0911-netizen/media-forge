import test from "node:test";
import assert from "node:assert/strict";
import { validateSceneMedia, sceneMediaReadiness } from "../src/creator-media.mjs";

const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082", "hex");
const entry = {filename:"hero.png",mimeType:"image/png",contentBase64:png.toString("base64"),sizeBytes:png.length};
test("five local uploaded PNGs are packaged as safe project paths", () => {
  const media=validateSceneMedia(Array.from({length:5},()=>entry));
  assert.equal(media.length,5);
  assert.equal(media[0].kind,"image");
  assert.equal(media[0].path,"assets/scenes/scene-01.png");
  assert.equal(media[4].path,"assets/scenes/scene-05.png");
});
test("does not allow URLs, SVG, malformed base64 or mismatched MIME", () => {
  for(const data of [
    {filename:"hero.svg",mimeType:"image/svg+xml",contentBase64:"eA=="},
    {...entry,mimeType:"image/svg+xml"},
    {...entry,contentBase64:"aR"},
    {...entry,contentBase64:Buffer.from("<script>alert(1)</script>").toString("base64")},
    {...entry,sizeBytes:1}
  ]){
    assert.throws(()=>validateSceneMedia([data,null,null,null,null]));
  }
});
test("test render requires five visuals and timed voice, but notes missing SFX", () => {
  const media=validateSceneMedia(Array.from({length:5},()=>entry));
  const scenes=Array.from({length:5},(_,i)=>({start:i*3,end:(i+1)*3,sound:"micro som"}));
  const without=sceneMediaReadiness(media,{voiceover:null,music:null},15,scenes);
  assert.equal(without.eligible,false);
  assert.match(without.blockers.join(" "),/locução/);
  const okay=sceneMediaReadiness(media,{voiceover:{durationSeconds:15,sizeBytes:1500},music:null},15,scenes);
  assert.equal(okay.eligible,true);
  assert.equal(okay.warnings.length>=5,true);
});
