import test from "node:test";
import assert from "node:assert/strict";
import { evaluateArtisticSignals } from "../artistic-signals.mjs";

test("Frame Lab returns measured motion evidence without claiming artistic approval", () => {
  const frames = Array.from({ length: 60 }, (_, frame) => ({
    frame,
    flow_mean_px: frame % 5 === 0 ? 0.8 : 0.35,
    changed_pixel_fraction: 0.01,
    camera_dx_px: 0.4,
    camera_dy_px: 0.1
  }));
  const report = {
    schemaVersion: "frame-lab-1.1",
    analysisMode: "every-decoded-frame-full-native-resolution-optical-flow",
    reference: { width: 1080, height: 1920, fps: 30, frameCount: 60, duration_s: 2, frames },
    comparison: [{ timeDeltaMs: 2 }, { timeDeltaMs: -4 }]
  };
  const result = evaluateArtisticSignals(report);
  assert.equal(result.status, "evidence-ready-human-review-required");
  assert.equal(result.metrics.frameCount, 60);
  assert.equal(result.metrics.comparedFrames, 2);
  assert.equal(result.metrics.maxFrameMatchOffsetMs, 4);
  assert.equal(result.automaticApproval, false);
  assert.ok(result.reviewChecklist.some(item => item.area === "composition-and-hierarchy"));
});

test("long low-motion runs are flagged for review, never auto-rejected", () => {
  const frames = Array.from({ length: 40 }, (_, frame) => ({
    frame, flow_mean_px: 0, changed_pixel_fraction: 0, camera_dx_px: 0, camera_dy_px: 0
  }));
  const result = evaluateArtisticSignals({
    reference: { fps: 20, frameCount: 40, duration_s: 2, frames }, comparison: []
  });
  assert.ok(result.findings.some(item => /0,8 s/.test(item)));
  assert.equal(result.humanReview, "required");
  assert.equal(result.automaticApproval, false);
});

test("missing frame evidence is reported honestly", () => {
  const result = evaluateArtisticSignals({ reference: { frames: [] } });
  assert.equal(result.status, "frame-evidence-unavailable");
  assert.equal(result.metrics, null);
  assert.equal(result.automaticApproval, false);
});
