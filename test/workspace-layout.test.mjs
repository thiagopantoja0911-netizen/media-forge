import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script} from "node:vm";
const root=new URL("../editor-studio/",import.meta.url);
const read=name=>readFile(new URL(name,root),"utf8");

test("workspace scripts use real editor controls without removing their DOM IDs",async()=>{
 const [html,js,oldApp,oldToggle]=await Promise.all([read("index.html"),read("workspace-layout.js"),read("app.js"),read("remotion-toggle.js")]);
 assert.match(html,/href="\/editor\/workspace-layout\.css"/);
 assert.match(html,/src="\/editor\/workspace-layout\.js"/);
 assert.ok(html.indexOf("remotion-toggle.js")<html.indexOf("workspace-layout.js"));
 for(const id of ["remotionOpen","remotionLayerPanel","scenePreview","playerViewport","sceneTrack","audioTrack","inspectorFields","editHeadline","renderButton","renderSceneButton","remotionRender"]){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/monitor\.append\(panel\)/);
 assert.match(js,/groupByHeadings\(inspector/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/sessionStorage\.setItem/);
 assert.match(oldApp,/getElementById/);
 assert.match(oldToggle,/remotionOpen/);
 assert.doesNotThrow(()=>new Script(js));
});
test("desktop workspace has bounded viewport and a persistent timeline",async()=>{
 const css=await read("workspace-layout.css");
 assert.match(css,/\.app\{height:100dvh;min-height:0;overflow:hidden\}/);
 assert.match(css,/\.mainpanel\{display:grid;grid-template-rows:auto minmax\(170px,1fr\) auto var\(--timeline-size\)/);
 assert.match(css,/\.timeline-panel\{height:100%;min-height:0;margin:0/);
 assert.match(css,/\.inspector\{min-height:0;max-height:100%;overflow-y:auto/);
 assert.match(css,/@media\(max-width:1000px\)/);
 assert.match(css,/\.player-shell #remotionLayerPanel/);
 assert.ok(!/display:none!important[^}]*\.timeline-panel/.test(css));
});
test("the editor HTTP route serves workspace assets",async()=>{
 const server=await readFile(new URL("../src/editor-studio-http.mjs",import.meta.url),"utf8");
 assert.match(server, /\["\/editor\/workspace-layout\.css","\.\.\/editor-studio\/workspace-layout\.css"\]/);
 assert.match(server, /\["\/editor\/workspace-layout\.js","\.\.\/editor-studio\/workspace-layout\.js"\]/);
});
