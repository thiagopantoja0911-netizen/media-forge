import test from "node:test";
import assert from "node:assert/strict";
import { makeCinematicV2Fixture, cinematicV2FilesFor } from "./fixtures/cinematic-v2-fixture.mjs";
import { validateCinematicV2JobPayload, validateCinematicV2CompletionReport } from "../src/cinematic-v2-gates.mjs";
import { reviewCinematicPolicyV2 } from "../src/cinematic-production-policy.mjs";
import { editMotionPlan } from "../src/motion/editor.mjs";
import { runCinematicV2RenderQa } from "../src/cinematic-render-qa.mjs";

function payloadFor(plan = makeCinematicV2Fixture()) {
  const projectFiles = [
    { path: "index.html", content: "<!doctype html><html><body><main>V2</main></body></html>" },
    { path: "motion-plan.json", content: JSON.stringify(plan) },
    ...cinematicV2FilesFor(plan)
  ];
  return {
    project: { renderer: "hyperframes", durationSeconds: plan.totalFrames / 30, fps: 30, aspectRatio: "9:16" },
    projectFiles,
    metadata: { source: "cinematic-motion-v2", productionMode: "cinematic", cinematicPolicyVersion: "v2" }
  };
}

test("shared post-render QA module is loadable by both worker paths", () => {
  assert.equal(typeof runCinematicV2RenderQa, "function");
});

test("public API gate requires the same packaged V2 plan and real local assets as MCP", () => {
  const payload = payloadFor();
  const accepted = validateCinematicV2JobPayload(payload);
  assert.equal(accepted.enabled, true);
  assert.equal(accepted.ok, true, accepted.errors.join("; "));
  assert.equal(accepted.policy.controls.length, 40);
  assert.equal(accepted.assetValidation.checked, true);

  const missingManifest = validateCinematicV2JobPayload({
    ...payload,
    projectFiles: payload.projectFiles.filter(file => file.path !== "motion-plan.json")
  });
  assert.equal(missingManifest.ok, false);
  assert.match(missingManifest.errors.join(" "), /motion-plan.json/);
});

test("API gate rejects V2 jobs on non-validated renderers or mismatched project metadata", () => {
  const payload = payloadFor();
  const wrongRenderer = validateCinematicV2JobPayload({
    ...payload,
    project: { ...payload.project, renderer: "remotion" }
  });
  assert.equal(wrongRenderer.ok, false);
  assert.match(wrongRenderer.errors.join(" "), /HyperFrames/);

  const wrongDuration = validateCinematicV2JobPayload({
    ...payload,
    project: { ...payload.project, durationSeconds: 12 }
  });
  assert.equal(wrongDuration.ok, false);
  assert.match(wrongDuration.errors.join(" "), /duration/);
});

test("motion editor returns the 40-control V2 preflight after every edit", () => {
  const plan = makeCinematicV2Fixture();
  const edited = editMotionPlan({
    motion_plan: plan,
    expected_revision: 0,
    edits: [{ action: "set_palette_color", color_key: "accent", color: "#334455" }]
  });
  assert.equal(edited.status, "edited-not-rendered");
  assert.equal(edited.plan.palette.accent, "#334455");
  assert.equal(edited.validation.cinematicPolicy.controls.length, 40);
  assert.equal(edited.validation.cinematicPolicy.enabled, true);
});

test("remote worker completion rejects missing evidence and accepts a QA-complete preview", () => {
  const payload = payloadFor();
  const gate = validateCinematicV2JobPayload(payload);
  const plan = JSON.parse(payload.projectFiles.find(file => file.path === "motion-plan.json").content);
  const evidence = {
    assetValidation: gate.assetValidation,
    technicalQA: { status: "passed", width: 1080, height: 1920, fps: 30, durationSeconds: 45, issues: [] },
    audioQA: { status: "passed", integratedLufs: -15, truePeakDb: -1.2, silenceSegments: [], clippedSamples: 0, issues: [] },
    frameQA: { status: "passed", frameSamples: 450, blackFrameCount: 0, freezeSegments: [], duplicateScenePairs: [], issues: [] },
    renderComplete: true,
    motionBlurApplied: true,
    artisticQA: "pending-user-review",
    artisticReview: { humanApproval: "required", automaticApproval: false }
  };
  const cinematicPolicy = reviewCinematicPolicyV2(plan, evidence);
  assert.equal(cinematicPolicy.ok, true, cinematicPolicy.errors.join("; "));
  const report = {
    ...evidence,
    cinematicPolicy,
    finalDeliveryApproved: false
  };
  const incomplete = validateCinematicV2CompletionReport({
    metadata: payload.metadata,
    report: { ...report, audioQA: null },
    artifactUploaded: true
  });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join(" "), /audioQA/);

  const accepted = validateCinematicV2CompletionReport({
    metadata: payload.metadata,
    report,
    artifactUploaded: true
  });
  assert.equal(accepted.ok, true, accepted.errors.join("; "));
  assert.equal(cinematicPolicy.finalDeliveryApproved, false);
});

test("remote worker cannot mark a Cinematic V2 render completed without uploaded MP4", () => {
  const payload = payloadFor();
  const plan = JSON.parse(payload.projectFiles.find(file => file.path === "motion-plan.json").content);
  const gate = validateCinematicV2JobPayload(payload);
  const cinematicPolicy = reviewCinematicPolicyV2(plan, {
    assetValidation: gate.assetValidation,
    technicalQA: { status: "passed" },
    audioQA: { status: "passed", integratedLufs: -15, truePeakDb: -1.2, silenceSegments: [], clippedSamples: 0 },
    frameQA: { status: "passed", frameSamples: 450, blackFrameCount: 0, freezeSegments: [], duplicateScenePairs: [] },
    renderComplete: true,
    motionBlurApplied: true,
    artisticQA: "pending-user-review"
  });
  const report = {
    technicalQA: { status: "passed" },
    audioQA: { status: "passed" },
    frameQA: { status: "passed" },
    cinematicPolicy,
    motionBlurApplied: true,
    artisticQA: "pending-user-review",
    artisticReview: { humanApproval: "required", automaticApproval: false },
    finalDeliveryApproved: false
  };
  const rejected = validateCinematicV2CompletionReport({
    metadata: payload.metadata, report, artifactUploaded: false
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(" "), /artifact/);
});
