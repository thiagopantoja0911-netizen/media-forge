import { requireMotionPlan } from "./motion/plan.mjs";
import { validateCinematicMediaAssets } from "./motion/assets-validation.mjs";
import { reviewCinematicPolicyV2 } from "./cinematic-production-policy.mjs";

export const CINEMATIC_V2_CONTROL_COUNT = 40;

export function isCinematicV2Job(metadata = {}) {
  return metadata?.cinematicPolicyVersion === "v2" || metadata?.source === "cinematic-motion-v2";
}

function fileText(file) {
  if (typeof file?.content === "string") return file.content;
  if (typeof file?.contentBase64 === "string") {
    return Buffer.from(file.contentBase64, "base64").toString("utf8");
  }
  return null;
}

/**
 * Authoritative API preflight. The MCP composer is not the only entry point:
 * direct /v1/jobs submissions must satisfy the same V2 contract.
 */
export function validateCinematicV2JobPayload({ project = {}, projectFiles = [], metadata = {} } = {}) {
  if (!isCinematicV2Job(metadata)) return { enabled: false, ok: true, errors: [] };

  const errors = [];
  if (metadata.productionMode !== "cinematic") errors.push("Cinematic V2 requires metadata.productionMode=cinematic.");
  if (metadata.cinematicPolicyVersion !== "v2") errors.push("Cinematic V2 requires metadata.cinematicPolicyVersion=v2.");
  if (project.renderer !== "hyperframes") errors.push("Cinematic V2 requires the validated HyperFrames renderer.");

  const files = Array.isArray(projectFiles) ? projectFiles : [];
  const manifestFile = files.find(file => file?.path === "motion-plan.json");
  const rawPlan = fileText(manifestFile);
  let plan = null;
  if (!rawPlan) errors.push("Cinematic V2 requires a packaged motion-plan.json.");
  else {
    try {
      if (Buffer.byteLength(rawPlan, "utf8") > 256 * 1024) throw new Error("manifest exceeds 256 KB");
      plan = JSON.parse(rawPlan);
    } catch (error) {
      errors.push("Cinematic V2 motion-plan.json is invalid: " + String(error.message || error).slice(0, 180));
    }
  }

  if (!plan) return { enabled: true, ok: false, errors };
  if (plan.productionMode !== "cinematic" || plan.cinematicPolicyVersion !== "v2") {
    errors.push("The packaged motion plan must declare productionMode=cinematic and cinematicPolicyVersion=v2.");
  }

  let motion;
  try {
    motion = requireMotionPlan(plan);
  } catch (error) {
    errors.push("Cinematic V2 motion plan failed structural validation: " + String(error.message || error).slice(0, 500));
    return { enabled: true, ok: false, errors };
  }
  const fps = Number(String(plan.fps).split("/")[0]) / Number(String(plan.fps).split("/")[1] || 1);
  const aspectRatio = plan.width > plan.height ? "16:9" : plan.width < plan.height ? "9:16" : "1:1";
  if (Number.isFinite(project.durationSeconds) && Math.abs(project.durationSeconds - plan.totalFrames / fps) > 1 / fps) {
    errors.push("Project duration does not match motion-plan.json.");
  }
  if (project.fps != null && Math.abs(Number(project.fps) - fps) > 0.001) {
    errors.push("Project FPS does not match motion-plan.json.");
  }
  if (project.aspectRatio && project.aspectRatio !== aspectRatio) {
    errors.push("Project aspect ratio does not match motion-plan.json.");
  }

  let assetValidation;
  try {
    assetValidation = validateCinematicMediaAssets(plan, files);
  } catch (error) {
    errors.push(String(error.message || error).slice(0, 500));
  }

  const policy = reviewCinematicPolicyV2(plan, { assetValidation });
  if (!policy.ok) errors.push(...policy.errors);
  return {
    enabled: true,
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    plan,
    motion,
    assetValidation: assetValidation ?? null,
    policy
  };
}

/**
 * The API completion endpoint is the final trust boundary for remote workers.
 * A worker cannot mark a V2 job completed with a missing QA report or MP4.
 */
export function validateCinematicV2CompletionReport({ metadata = {}, report = null, artifactUploaded = false } = {}) {
  if (!isCinematicV2Job(metadata)) return { enabled: false, ok: true, errors: [] };

  const errors = [];
  if (metadata.productionMode !== "cinematic" || metadata.cinematicPolicyVersion !== "v2") {
    errors.push("Job metadata is not a complete Cinematic V2 declaration.");
  }
  if (artifactUploaded !== true) errors.push("Cinematic V2 completion requires the MP4 artifact to be uploaded.");
  for (const key of ["technicalQA", "audioQA", "frameQA"]) {
    if (report?.[key]?.status !== "passed") errors.push("Cinematic V2 requires " + key + ".status=passed.");
  }

  const policy = report?.cinematicPolicy;
  if (policy?.enabled !== true || policy?.ok !== true) errors.push("Cinematic V2 policy report is missing or failed.");
  if (!Array.isArray(policy?.controls) || policy.controls.length !== CINEMATIC_V2_CONTROL_COUNT) {
    errors.push("Cinematic V2 completion must report all 40 controls.");
  } else {
    const ids = new Set(policy.controls.map(control => control.id));
    if (ids.size !== CINEMATIC_V2_CONTROL_COUNT) errors.push("Cinematic V2 report contains duplicate or missing control IDs.");
    const unresolved = policy.controls.filter(control => !["passed", "review_required", "warning"].includes(control.status));
    if (unresolved.length) errors.push("Cinematic V2 has unresolved controls: " + unresolved.map(control => control.id + "=" + control.status).join(", "));
  }

  if (report?.motionBlurApplied !== true) errors.push("Cinematic V2 requires confirmed temporal motion blur from the validated renderer.");
  const artisticApproved = report?.artisticQA === "approved";
  if (!artisticApproved && report?.artisticQA !== "pending-user-review") {
    errors.push("Cinematic V2 artisticQA must remain pending human review or be explicitly approved.");
  }
  if (report?.artisticReview?.humanApproval !== "required" || report?.artisticReview?.automaticApproval !== false) {
    errors.push("Cinematic V2 must preserve an explicit human artistic-review gate; automatic approval is forbidden.");
  }
  const expectedFinalApproval = artisticApproved && policy?.finalDeliveryApproved === true;
  if (report?.finalDeliveryApproved !== expectedFinalApproval || policy?.finalDeliveryApproved !== expectedFinalApproval) {
    errors.push("Cinematic V2 final-delivery status does not match the human artistic-review evidence.");
  }
  if (artisticApproved && policy?.controls?.some(control => control.status !== "passed")) {
    errors.push("Final artistic approval requires all 40 controls to be passed.");
  }

  return { enabled: true, ok: errors.length === 0, errors };
}
