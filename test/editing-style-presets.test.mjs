import test from "node:test";
import assert from "node:assert/strict";
import { getEditingStylePreset, listEditingStyles, applyEditingStyleToStoryboard } from "../src/editing-style-presets.mjs";
import { planFromShortBrief } from "../src/creative-director.mjs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";

const id="minimal-outline-explainer-v1";

test("reference preset persists and stays discoverable",()=>{
  const profile=getEditingStylePreset(id);
  assert.equal(profile.source.durationSeconds,64.9);
  assert.equal(profile.source.width,1920);
  assert.equal(profile.source.height,1080);
  assert.equal(profile.source.fps,30);
  assert.match(profile.source.sha256,/^[0-9a-f]{64}$/);
  assert.ok(listEditingStyles().some(s=>s.id===id));
  assert.deepEqual(profile.identity.palette,["#080808","#ffffff","#9b9b9b"]);
});

test("unsupported editing style is rejected, not guessed",()=>{
  assert.equal(getEditingStylePreset(undefined),null);
  assert.throws(()=>getEditingStylePreset("broken"),/EDITING_STYLE_UNSUPPORTED/);
});

test("editing style actively changes per-shot directions but preserves brief and duration",()=>{
  const input={brand:"Projeto Educativo",idea:"Mostrar como um processo ajuda a vender um produto",editing_style:id,goal:"sales",duration_seconds:24};
  const plan=planFromShortBrief(input);
  assert.equal(plan.editingStyle.id,id);
  assert.equal(plan.production.editingStylePreset,id);
  assert.equal(plan.storyboard[0].start,0);
  assert.equal(plan.storyboard.at(-1).end,24);
  assert.match(plan.storyboard[0].visualTreatment,/black|white/);
  assert.ok(plan.storyboard.every(s=>s.motionDirection&&s.graphicRules&&s.sound));
  assert.equal(plan.brief.goal,"sales");
  const raw=planFromShortBrief({...input,editing_style:undefined});
  assert.equal(raw.editingStyle,undefined);
  assert.equal(raw.storyboard[0].visualTreatment,undefined);
  assert.deepEqual(raw.storyboard.map(s=>s.movement),plan.storyboard.map(s=>s.movement));
});

test("catalog and optional style selector are exposed to MCP without changing required brief fields",()=>{
  const catalog=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="list_editing_styles");
  const planner=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="plan_video_from_brief");
  assert.ok(catalog);
  assert.deepEqual(catalog.inputSchema,{type:"object",additionalProperties:false});
  assert.deepEqual(planner.inputSchema.required,["brand","idea"]);
  assert.ok(planner.inputSchema.properties.editing_style.enum.includes(id));
});

test("no reference media asset path or silent audio reuse is bundled in preset",()=>{
  const p=getEditingStylePreset(id);
  assert.match(p.production.reusePolicy,/do not.*copy/i);
  assert.equal(p.audio.voicePriority,true);
  assert.ok(p.audio.qualityChecklist===undefined);
  assert.equal(applyEditingStyleToStoryboard([{id:"one",start:0,end:2}],null)[0].id,"one");
});
