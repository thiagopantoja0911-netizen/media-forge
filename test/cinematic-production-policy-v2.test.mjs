import test from "node:test";
import assert from "node:assert/strict";
import {
 CINEMATIC_PRODUCTION_POLICY,CINEMATIC_POLICY_VERSION,
 reviewCinematicPolicyV2,validateStudyUsage
} from "../src/cinematic-production-policy.mjs";
import {validateMotionPlan} from "../src/motion/plan.mjs";
import {buildCinematicCaptionTrack} from "../src/motion/captions.mjs";
import {buildCinematicSceneEffects} from "../src/motion/cinematic-effects.mjs";
import {buildCinematicDepthLayers} from "../src/motion/cinematic-depth.mjs";
import {makeCinematicV2Fixture,cinematicV2FilesFor} from "./fixtures/cinematic-v2-fixture.mjs";

test("catalog has 40 unique permanent policy controls in five domains",()=>{
 const p=CINEMATIC_PRODUCTION_POLICY;
 assert.equal(p.version,CINEMATIC_POLICY_VERSION);
 assert.equal(p.controls.length,40);
 assert.equal(new Set(p.controls.map(c=>c.id)).size,40);
 assert.deepEqual([...new Set(p.controls.map(c=>c.group))],["narrative","image","editing","audio","quality"]);
 assert.equal(p.assetRules.flatVectorAsPrimaryScene,false);
 assert.equal(p.review.markFinalBeforeArtisticApproval,false);
});

test("cinematic V2 validates every one of the 40 requirements with evidence, not labels",()=>{
 const plan=makeCinematicV2Fixture();
 const report=reviewCinematicPolicyV2(plan,{assetValidation:{checked:true,duplicateAssets:[]}});
 assert.equal(report.ok,true,report.errors.join("; "));
 assert.equal(report.controls.length,40);
 assert.ok(report.metrics.realMediaPct>=70);
 assert.ok(report.metrics.movingFootagePct>=50);
 assert.ok(report.metrics.captionSfx>=1);
 assert.ok(report.metrics.motionSfx>=1);
 assert.ok(report.metrics.transitionSfx>=1);
 assert.ok(report.controls.every(c=>c.status!=="pending"),"each control must have an explicit state");
 assert.equal(report.finalDeliveryApproved,false);
 assert.equal(validateMotionPlan(plan).ok,true,validateMotionPlan(plan).errors.join("; "));
});

test("the final delivery gate stays closed until render, audio, frame and human review evidence exist",()=>{
 const plan=makeCinematicV2Fixture();
 const preflight=reviewCinematicPolicyV2(plan,{assetValidation:{checked:true,duplicateAssets:[]}});
 assert.equal(preflight.controls.find(c=>c.id==="render-frame-inspection").status,"pending_render");
 assert.equal(preflight.controls.find(c=>c.id==="technical-probe").status,"pending_render");
 const evidence={
  assetValidation:{checked:true,duplicateAssets:[]},
  technicalQA:{status:"passed",width:1080,height:1920,fps:30,durationSeconds:45},
  audioQA:{status:"passed",integratedLufs:-15.1,truePeakDb:-1.2,silenceSegments:[],clippedSamples:0},
  frameQA:{status:"passed",frameSamples:450,blackFrameCount:0,freezeSegments:[],duplicateScenePairs:[]},
  artisticQA:"pending-user-review",motionBlurApplied:true,renderComplete:true
 };
 const afterTechnical=reviewCinematicPolicyV2(plan,evidence);
 assert.equal(afterTechnical.controls.find(c=>c.id==="artistic-review").status,"review_required");
 assert.equal(afterTechnical.finalDeliveryApproved,false);
 evidence.artisticQA="approved";
 const approved=reviewCinematicPolicyV2(plan,evidence);
 assert.equal(approved.ok,true,approved.errors.join("; "));
 assert.equal(approved.finalDeliveryApproved,true);
 assert.ok(approved.controls.every(c=>c.status==="passed"),JSON.stringify(approved.controlSummary));
});

test("cinematic v2 rejects vector-only cards, missing story actions, word timing and scene sound",()=>{
 const plan=makeCinematicV2Fixture();
 plan.scenes[0].narrativeAction=null;
 plan.scenes[1].type="kinetic";
 plan.scenes[2].depthLayers=[];
 plan.captions[0].words=[];
 plan.scenes[4].soundDesign.cueIds=[];
 const report=reviewCinematicPolicyV2(plan);
 assert.equal(report.ok,false);
 assert.match(report.errors.join(" | "),/ação física|mídia real|foco seletivo|palavras com timestamps|soundDesign/);
});

test("existing saved cinematic plans can still be inspected without forcing V2 migration",()=>{
 const plan=makeCinematicV2Fixture();delete plan.cinematicPolicyVersion;
 assert.equal(reviewCinematicPolicyV2(plan).enabled,false);
});

test("study is only an explicitly marked technical/preview workflow",()=>{
 assert.equal(validateStudyUsage({production_profile:"premium-motion-v1"}).ok,true);
 assert.equal(validateStudyUsage({production_profile:"study"}).ok,false);
 assert.equal(validateStudyUsage({production_profile:"study",study_purpose:"visual-prototype"}).previewOnly,true);
});

test("caption overlay is word-timed, legible, uses the declared safe zone and escapes HTML",()=>{
 const plan=makeCinematicV2Fixture();
 plan.captions[1].text='<script>alert("x")</script>';
 const track=buildCinematicCaptionTrack(plan);
 assert.equal(track.count,8);
 assert.match(track.html,/data-track-kind="captions"/);
 assert.match(track.html,/mf-caption-word-1-1/);
 assert.ok(track.html.includes("&lt;script&gt;"));
 assert.ok(!track.html.includes('<script>alert'));
 assert.match(track.timeline,/timeline\.fromTo/);
 assert.match(track.css,/caption-emphasis/);
 assert.match(track.css,/left:9%/);
 assert.match(track.css,/bottom:18%/);
});

test("scene compositor provides actual bloom, shadow, shot reframe, temporal shutter and parallax depth",()=>{
 const plan=makeCinematicV2Fixture();
 const fx=buildCinematicSceneEffects(plan.scenes[0],plan);
 assert.equal(fx.enabled,true);
 assert.equal(fx.motionBlurEnabled,true);
 assert.match(fx.overlay,/mf-fx-bloom/);
 assert.match(fx.overlay,/mf-fx-shadow/);
 assert.match(fx.overlay,/mf-fx-micro/);
 assert.match(fx.timeline,/tl\.fromTo/);
 assert.match(fx.mediaStyle,/contrast/);
 const depth=buildCinematicDepthLayers(plan.scenes[2],plan);
 assert.equal(depth.enabled,true);
 assert.equal(depth.count,3);
 assert.match(depth.html,/mf-depth-foreground/);
 assert.match(depth.css,/filter:blur/);
 assert.match(depth.timeline,/tl\.fromTo/);
 const legacy={...plan,cinematicPolicyVersion:null};
 assert.equal(buildCinematicSceneEffects(plan.scenes[0],legacy).enabled,false);
});
