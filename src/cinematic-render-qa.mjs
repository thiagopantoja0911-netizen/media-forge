import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectRenderedVideo, inspectRenderedAudio, inspectRenderedFrames } from "./video-qa.mjs";
import { mixCinematicAudio } from "./cinematic-audio-mix.mjs";
import { reviewCinematicPolicyV2 } from "./cinematic-production-policy.mjs";

function reject(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

function fpsValue(value) {
  const parts = String(value).split("/");
  return Number(parts[0]) / Number(parts[1] || 1);
}

/**
 * Shared post-render QA used by both the local and remote Windows workers.
 * A completed job means a technically validated preview; human approval is separate.
 */
export async function runCinematicV2RenderQa({
  outputPath, project = {}, projectDir, metadata = {}, motionReview = {}, motionBlurApplied = false
} = {}) {
  let plan;
  try {
    plan = JSON.parse(await readFile(join(projectDir, "motion-plan.json"), "utf8"));
  } catch (error) {
    throw reject("CINEMATIC_PLAN_MISSING", "Cinematic V2 motion plan unavailable after render: " + error.message);
  }

  const fps = fpsValue(plan.fps);
  if (!Number.isFinite(fps) || fps <= 0) throw reject("CINEMATIC_PLAN_INVALID", "Cinematic V2 FPS is invalid.");
  const durationSeconds = plan.totalFrames / fps;

  const audioMix = await mixCinematicAudio({ videoPath: outputPath, projectDir, plan });
  const technicalQA = await inspectRenderedVideo(outputPath, {
    ...project,
    width: motionReview.width,
    height: motionReview.height
  }, metadata.expectsAudio === true || motionReview.expectsAudio === true);
  if (technicalQA.status !== "passed") {
    throw reject("CINEMATIC_TECHNICAL_QA_REQUIRED",
      "Cinematic V2 requires FFprobe approval: " + (technicalQA.issues || []).join("; "));
  }

  const audioQA = await inspectRenderedAudio(outputPath, { durationSeconds });
  if (audioQA.status !== "passed") {
    throw reject("AUDIO_MIX_QA_FAILED", "Cinematic audio QA failed: " + (audioQA.issues || []).join("; "));
  }

  const frameQA = await inspectRenderedFrames(outputPath, { plan, durationSeconds });
  if (frameQA.status !== "passed") {
    throw reject("CINEMATIC_FRAME_QA_FAILED", "Cinematic V2 frame inspection failed: " + (frameQA.issues || []).join("; "));
  }

  const cinematicPolicy = reviewCinematicPolicyV2(plan, {
    assetValidation: metadata.assetValidation,
    technicalQA,
    audioQA,
    frameQA,
    renderComplete: true,
    motionBlurApplied: motionBlurApplied === true,
    artisticQA: "pending-user-review"
  });
  if (!cinematicPolicy.ok) {
    throw reject("CINEMATIC_POLICY_QA_FAILED",
      "Cinematic V2 final structural QA failed: " + (cinematicPolicy.errors || []).join("; "));
  }

  return {
    technicalQA,
    audioQA,
    frameQA,
    audioMix,
    motionBlurApplied: motionBlurApplied === true,
    cinematicPolicy,
    artisticQA: "pending-user-review",
    finalDeliveryApproved: false
  };
}
