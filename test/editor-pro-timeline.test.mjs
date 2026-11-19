import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const app=read("editor-studio/app.js");
const extension=read("editor-studio/workspace-layout.js");
const stylesheet=read("editor-studio/workspace-layout.css");
const html=read("editor-studio/index.html");

test("pro timeline stays inside the original authenticated editor and retains old DOM contracts",()=>{
 assert.match(html,/\/editor\/workspace-layout\.js/);
 for(const id of ["sceneTrack","textTrack","motionTrack","layerTrack","captionTrack","audioTrack","timelineItemInspector","sceneSeek"]){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(app,/window\.MediaForgeTimelineAPI=Object\.freeze/);
 assert.match(app,/window\.MediaForgeProTimeline\?\.refresh/);
 assert.match(extension,/window\.MediaForgeProTimeline=Object\.freeze/);
 assert.match(extension,/function renderRail\(/);
 assert.match(extension,/function updatePlayheads\(/);
 assert.match(stylesheet,/\.pro-timeline-toolbar/);
});
test("pro editor supports non-destructive track operations and frame-accurate movement",()=>{
 for(const operation of ["function splitSelection()","function duplicateSelection()","function removeSelection()","function attachDrag(","function magnet(","function seekMark(","function zoomTo("]){
  assert.ok(extension.includes(operation),operation);
 }
 assert.match(extension,/if\(kind==="layer"\)/);
 assert.match(extension,/keyframes=\(item\.keyframes/);
 assert.match(extension,/trimStartSeconds/);
 assert.match(extension,/window\.confirm\("Remover este elemento/);
 assert.match(extension,/state\.zoom/);
 assert.match(extension,/state\.snap/);
 assert.match(extension,/contenteditable/);
});
test("AI handoff exports edit manifest without private asset bytes or destructive writes",()=>{
 assert.match(extension,/format:"mediaforge-timeline-pro-v1"/);
 assert.match(extension,/projectId:p\.id/);
 assert.match(extension,/layers:p\.layers/);
 assert.match(extension,/captions:p\.captions/);
 assert.match(extension,/audio:\(p\.audio\|\|\[\]\)\.map/);
 assert.doesNotMatch(extension,/fetch\(|localStorage|eval\(/);
 assert.doesNotMatch(extension,/render_editor_project|\/v1\/jobs|create_video/);
});
test("timeline JavaScript stays syntactically valid for modern Chromium",()=>{
 assert.doesNotThrow(()=>new Script(app));
 assert.doesNotThrow(()=>new Script(extension));
});
