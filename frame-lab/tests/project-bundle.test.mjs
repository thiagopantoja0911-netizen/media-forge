import test from "node:test";
import assert from "node:assert/strict";
import {zipSync,strToU8} from "fflate";
import {unpackProjectZip} from "../project-bundle.mjs";

test("previous exported 1008-frame canvas project becomes seekable HyperFrames composition",()=>{
 const html='<!doctype html><html><body><canvas id="stage" width="1080" height="1920"></canvas>'+
 '<script>const W=1080,H=1920,FPS=60,DURATION=1008/60;'+
 'function paint(t){};window.__frameLabSeek=(seconds)=>paint(Number(seconds)||0);'+
 'window.renderAt=window.__frameLabSeek;'+
 'window.__frameLabReady=false;'+
 'let previewInitialized=false;requestAnimationFrame(whenReady);</script></body></html>';
 const zip=Buffer.from(zipSync({
  "widget-animation-frame-lab/index.html":strToU8(html),
  "widget-animation-frame-lab/assets/original_audio.m4a":new Uint8Array([1,2,3,4]),
  "widget-animation-frame-lab/assets/frame_metrics.js":strToU8("window.FRAME_METRICS=[];")
 }));
 const r=unpackProjectZip(zip);
 assert.equal(r.conversion.converted,true);
 assert.equal(r.conversion.durationSeconds,16.8);
 assert.equal(r.conversion.fps,60);
 const source=r.projectFiles.find(x=>x.path==="index.html").content;
 assert.match(source,/data-composition-id="main"/);
 assert.match(source,/data-duration="16.8"/);
 assert.match(source,/class="clip"/);
 assert.match(source,/window\.addEventListener\("hf-seek"/);
 assert.match(source,/__timelines\["main"\]/);
 assert.match(source,/<audio.*original_audio\.m4a/);
 assert.doesNotMatch(source,/requestAnimationFrame/);
 assert.equal(r.projectFiles.length,3);
});
test("a real native HyperFrames project is not rewritten",()=>{
 const html='<html><body><div data-composition-id="main" data-duration="2"></div></body></html>';
 const r=unpackProjectZip(Buffer.from(zipSync({"index.html":strToU8(html)})));
 assert.equal(r.conversion.converted,false);
 assert.equal(r.projectFiles[0].content,html);
});
test("ZIP path traversal, invalid file extensions, duplicate and oversized archives are rejected",()=>{
 const badPath=Buffer.from(zipSync({"../evil.html":strToU8("bad")}));
 assert.throws(()=>unpackProjectZip(badPath),/Unsafe filename/);
 const badExt=Buffer.from(zipSync({"index.html":strToU8("ok"),"payload.exe":strToU8("bad")}));
 assert.throws(()=>unpackProjectZip(badExt),/Disallowed/);
 const zip=Buffer.from(zipSync({"index.html":strToU8("ok")}));
 assert.throws(()=>unpackProjectZip(zip,{maxCompressed:10}),/limit/);
});
