import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeEditorProject, validateEditorProject } from "../src/editor-studio-core.mjs";
import { applyEditorTimelineOperations } from "../src/editor-timeline.mjs";
import { buildEditorIndex, buildEditorSceneModule } from "../src/editor-studio-engine.mjs";

const base=()=>makeEditorProject({
  idea:"Apresentação institucional de uma empresa profissional com movimento, camadas e legendas.",
  brand:"NEXO",title:"NEXO · apresentação",duration_seconds:15,fps:30,aspect_ratio:"9:16"
});

test("projects start with a clean independent timeline",()=>{
  const project=base();
  assert.deepEqual(project.layers,[]);
  assert.deepEqual(project.captions,[]);
  assert.deepEqual(project.layerAssets,[]);
  assert.equal(project.totalFrames,450);
  assert.equal(validateEditorProject(project),project);
});

test("timeline operations add independent layers, keyframes and dynamic captions",()=>{
  const project=base();
  const videoId="a".repeat(32);
  project.layerAssets=[{id:videoId,name:"background.mp4",size:128,extension:"mp4",mime:"video/mp4"}];
  const next=applyEditorTimelineOperations(project,{
    layer_operations:[
      {action:"add",layer:{type:"video",name:"Vídeo de fundo",assetId:videoId,zIndex:-1,loop:true}},
      {action:"add",layer:{type:"shape",name:"Gradiente",background:"linear-gradient(135deg, #101b45, #43266f, #075c78)",zIndex:-2}},
      {action:"add",layer:{type:"text",name:"Título",text:"NEXO",startFrame:0,endFrame:450,keyframes:[
        {frame:0,x:120,y:500,opacity:0,scale:.8,easing:"ease-in-out"},
        {frame:30,x:80,y:430,opacity:1,scale:1,easing:"spring"}
      ]}}
    ],
    caption_operations:[
      {action:"add",caption:{text:"Estratégia que transforma negócios.",startFrame:0,endFrame:90,style:"karaoke",animation:"rise"}}
    ]
  });
  assert.equal(next.layers.length,3);
  assert.equal(next.layers[0].type,"video");
  assert.equal(next.layers[2].keyframes.length,2);
  assert.equal(next.captions.length,1);
  assert.equal(next.captions[0].style,"karaoke");
  assert.equal(validateEditorProject(next),next);
});

test("timeline updates, reorders and removes layers without touching other tracks",()=>{
  const project=base();
  const first=applyEditorTimelineOperations(project,{layer_operations:[
    {action:"add",layer:{type:"text",name:"A",text:"A"}},
    {action:"add",layer:{type:"shape",name:"B"}}
  ]});
  const a=first.layers[0].id,b=first.layers[1].id;
  const next=applyEditorTimelineOperations(first,{layer_operations:[
    {action:"reorder",layer_id:a,zIndex:70},
    {action:"add_keyframe",layer_id:a,keyframe:{frame:15,x:120,easing:"ease-out"}},
    {action:"remove",layer_id:b}
  ]});
  assert.equal(next.layers.length,1);
  assert.equal(next.layers[0].zIndex,70);
  assert.equal(next.layers[0].keyframes[0].frame,15);
});

test("invalid keyframe easing and unsafe gradient are rejected",()=>{
  const project=base();
  assert.throws(()=>applyEditorTimelineOperations(project,{layer_operations:[
    {action:"add",layer:{type:"shape",background:"url(https://example.com/x.png)"}}
  ]}),/gradient/i);
  assert.throws(()=>applyEditorTimelineOperations(project,{layer_operations:[
    {action:"add",layer:{type:"text",text:"X",keyframes:[{frame:0,x:0,easing:"bounce"}]}}
  ]}),/easing/i);
});

test("Three.js preview and HyperFrames HTML share layer and caption timing",()=>{
  const project=base();
  const withLayers=applyEditorTimelineOperations(project,{
    layer_operations:[
      {action:"add",layer:{type:"shape",name:"Fundo",background:"linear-gradient(135deg, #111b42, #36246f)",zIndex:-1}},
      {action:"add",layer:{type:"text",name:"Título",text:"NEXO",keyframes:[
        {frame:0,y:900,opacity:0,easing:"ease-in-out"},{frame:30,y:760,opacity:1,easing:"spring"}
      ]}}
    ],
    caption_operations:[{action:"add",caption:{text:"Uma empresa feita para avançar.",startFrame:0,endFrame:90}}]
  });
  const html=buildEditorIndex(withLayers,{preview:true,sceneIndex:0,projectId:withLayers.id});
  const module=buildEditorSceneModule(withLayers,{preview:true,sceneIndex:0});
  assert.match(html,/id="layer-/);
  assert.match(html,/linear-gradient/);
  assert.match(html,/editor-caption/);
  assert.match(html,/data-start=/);
  assert.match(module,/updateEditorOverlays/);
  assert.match(module,/timelineValue/);
  assert.match(module,/FRAME_OFFSET/);
  assert.match(module,/spring/);
});

test("editor opens without silently restoring the latest project",async()=>{
  const source=await readFile(new URL("../editor-studio/app.js",import.meta.url),"utf8");
  assert.match(source,/if\(!id\)\{clearWorkspace\(\);return;\}/);
  assert.doesNotMatch(source,/api\/editor\/latest/);
  assert.match(source,/refreshProjectIfChanged/);
});
