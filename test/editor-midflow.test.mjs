import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editMotionPlan } from "../src/motion/editor.mjs";
import { validateMotionPlan } from "../src/motion/plan.mjs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";

const makePlan=()=>JSON.parse(readFileSync(new URL("../examples/motion/widget-study.json",import.meta.url),"utf8"));
const withAudio=()=>{
  const plan=makePlan();
  plan.audioMode="sound-design";
  plan.audioCues=[
    {id:"bed",src:"assets/music.mp3",role:"music",startFrame:0,endFrame:720,volume:.4,provenance:"original composition"},
    {id:"tick",src:"assets/tick.wav",role:"sfx",startFrame:184,endFrame:202,volume:.5,provenance:"original SFX",eventId:"cards-arrive"}
  ];
  assert.equal(validateMotionPlan(plan).ok,true);
  return plan;
};
test("updates text, palette, camera and transition without mutating original",()=>{
  const source=makePlan();
  source.scenes[0].type="product";
  source.scenes[0].media="assets/product.png";
  source.scenes[0].events[1].action="camera";
  const old=JSON.stringify(source);
  const edited=editMotionPlan({motion_plan:source,expected_revision:0,edits:[
    {action:"set_text",scene_id:"opening",field:"headline",text:"Mais alcance, mais estratégia."},
    {action:"set_camera",scene_id:"opening",camera:"dolly-in"},
    {action:"set_palette_color",color_key:"accent",color:"#ffffff"},
    {action:"set_transition",scene_id:"dashboard",transition:"whip"}
  ]});
  assert.equal(edited.status,"edited-not-rendered");
  assert.equal(edited.revision,1);
  assert.equal(edited.plan.scenes[0].headline,"Mais alcance, mais estratégia.");
  assert.equal(edited.plan.scenes[0].camera,"dolly-in");
  assert.equal(edited.plan.palette.accent,"#ffffff");
  assert.equal(edited.plan.scenes[1].transition,"whip");
  assert.equal(JSON.stringify(source),old);
  assert.equal(validateMotionPlan(edited.plan).ok,true);
});
test("duration edit shifts following scenes and full-length music; preserves valid cue alignment",()=>{
  const source=withAudio();
  const edited=editMotionPlan({motion_plan:source,edits:[
    {action:"set_scene_duration",scene_id:"dashboard",frames:420},
    {action:"set_audio_volume",cue_id:"bed",volume:.25},
    {action:"align_sfx",cue_id:"tick"}
  ]});
  const p=edited.plan;
  assert.equal(p.totalFrames,750);
  assert.equal(p.scenes[1].endFrame,570);
  assert.equal(p.scenes[2].startFrame,570);
  assert.equal(p.scenes[2].endFrame,750);
  assert.equal(p.audioCues[0].endFrame,750);
  assert.equal(p.audioCues[0].volume,.25);
  assert.equal(p.audioCues[1].startFrame,180);
  assert.equal(p.audioCues[1].endFrame,198);
  assert.equal(validateMotionPlan(p).ok,true);
});
test("shrink rejects orphaned events and audio starts, preserving input",()=>{
  const source=withAudio(),old=JSON.stringify(source);
  assert.throws(()=>editMotionPlan({motion_plan:source,edits:[
    {action:"set_scene_duration",scene_id:"dashboard",frames:120}
  ]}),error=>["EDITOR_EVENT_TRIM_CONFLICT","EDITOR_AUDIO_TRIM_CONFLICT"].includes(error.code));
  assert.equal(JSON.stringify(source),old);
});
test("event timing validates order, then sfx follows visible event peak",()=>{
  const source=withAudio();
  const edited=editMotionPlan({motion_plan:source,edits:[
    {action:"set_event_timing",scene_id:"dashboard",event_id:"cards-arrive",timing:{startFrame:0,peakFrame:36,endFrame:50}},
    {action:"align_sfx",cue_id:"tick"}
  ]});
  assert.equal(edited.plan.audioCues[1].startFrame,186);
  assert.equal(validateMotionPlan(edited.plan).ok,true);
});
test("invalid edit batch is atomic and revision conflicts are rejected",()=>{
  const original=makePlan(),snapshot=JSON.stringify(original);
  assert.throws(()=>editMotionPlan({motion_plan:original,expected_revision:1,edits:[
    {action:"set_text",scene_id:"opening",field:"headline",text:"Novo"}
  ]}),error=>error.code==="EDITOR_REVISION_CONFLICT");
  assert.throws(()=>editMotionPlan({motion_plan:original,edits:[
    {action:"set_text",scene_id:"opening",field:"headline",text:"Novo"},
    {action:"set_camera",scene_id:"opening",camera:"hyperspace"}
  ]}),error=>error.code==="EDITOR_CAMERA_INVALID");
  assert.equal(JSON.stringify(original),snapshot);
});
test("rejects unsafe or impossible edits and does not allow raw code execution",()=>{
  const plan=makePlan();
  assert.throws(()=>editMotionPlan({motion_plan:plan,edits:[
    {action:"set_text",scene_id:"opening",field:"headline",text:""}
  ]}),error=>error.code==="EDITOR_TEXT_INVALID");
  assert.throws(()=>editMotionPlan({motion_plan:plan,edits:[
    {action:"set_event_timing",scene_id:"opening",event_id:"opening-arrive",timing:{startFrame:100,peakFrame:140,endFrame:145}}
  ]}),error=>error.code==="EDITOR_RESULT_INVALID");
  assert.throws(()=>editMotionPlan({motion_plan:plan,edits:[{action:"remove_file",path:"../../secret"}]}),error=>error.code==="EDITOR_OPERATION_INVALID");
  assert.throws(()=>editMotionPlan({motion_plan:plan,edits:[{action:"set_palette_color",color_key:"ground",color:"red"}]}),error=>error.code==="EDITOR_COLOR_INVALID");
});
test("MCP adds new editor tool; original render tools are untouched",()=>{
  const names=VIDEOS_SECRETS_TOOLS.map(x=>x.name);
  assert.ok(names.includes("edit_motion_plan"));
  assert.ok(names.includes("create_motion_video"));
  assert.ok(names.includes("frame_lab_status"));
  const schema=VIDEOS_SECRETS_TOOLS.find(x=>x.name==="edit_motion_plan").inputSchema;
  assert.deepEqual(schema.required,["motion_plan","edits"]);
  assert.equal(schema.properties.edits.maxItems,16);
});
