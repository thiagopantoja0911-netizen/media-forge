import { importSalevoStudioDraft } from "./legacy-studio.mjs";
import { buildCreatorComposition } from "./creator-composer.mjs";
import { buildMotionComposition } from "./motion/composer.mjs";

function reply(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

/**
 * The Studio API is session-authenticated. Controlled render submission does not
 * bypass the creator delivery gate: it produces TEST jobs only, after explicit
 * consent. Legacy creator uses five uploaded scenes and narration; the motion
 * composer validates its frame plan and its declared audio/media requirements.
 */
export async function handleStudioApi({ request, response, parseBody, isAdminSession, createJob, getJob }) {
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname;
  const isMotion = path.startsWith("/api/studio/motion/");
  const isCompose = path === "/api/studio/compose" || path === "/api/studio/motion/compose";
  const isRender = path === "/api/studio/render" || path === "/api/studio/motion/render";
  const statusId = /^\/api\/studio\/jobs\/([a-f0-9]{32})$/.exec(path)?.[1];
  if (!isCompose && !isRender && !statusId) return false;
  if (request.method !== (statusId ? "GET" : "POST")) {
    response.writeHead(405, { allow: statusId ? "GET" : "POST", "cache-control": "no-store" });
    response.end();
    return true;
  }
  if (!(await isAdminSession(request))) {
    reply(response, 401, { ok: false, error: "AUTH_REQUIRED" });
    return true;
  }
  if (statusId) {
    if (typeof getJob !== "function") {
      reply(response, 503, { ok: false, error: "JOB_STATUS_UNAVAILABLE" });
      return true;
    }
    const job = await getJob(statusId);
    if (!job || job.metadata?.source !== "forge-midjourney-studio" || job.metadata?.mode !== "controlled-test") {
      reply(response, 404, { ok: false, error: "JOB_NOT_FOUND" });
      return true;
    }
    reply(response, 200, { ok: true, job: {
      id: job.id, status: job.status, progress: job.progress,
      result: job.result ?? null, error: job.error ?? null,
      updatedAt: job.updatedAt
    } });
    return true;
  }

  const fetchSite = String(request.headers?.["sec-fetch-site"] ?? "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    reply(response, 403, { ok: false, error: "CROSS_ORIGIN_REQUEST" });
    return true;
  }
  const contentType = String(request.headers?.["content-type"] ?? "");
  if (contentType && !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    reply(response, 415, { ok: false, error: "JSON_REQUIRED" });
    return true;
  }
  const origin = request.headers?.origin;
  if (origin && request.headers?.host) {
    let originHost;
    try { originHost = new URL(origin).host.toLowerCase(); } catch { originHost = ""; }
    const host = String(request.headers.host).toLowerCase();
    if (!originHost || originHost !== host) {
      reply(response, 403, { ok: false, error: "CROSS_ORIGIN_REQUEST" });
      return true;
    }
  }

  try {
    const raw = await parseBody(request);
    if (isRender && raw.confirmControlledRender !== true) {
      reply(response, 428, { ok: false, error: "RENDER_CONFIRMATION_REQUIRED" });
      return true;
    }
    const imported = isMotion ? {warnings:[]} : importSalevoStudioDraft(raw);
    const mediaAssets = raw.mediaAssets && typeof raw.mediaAssets === "object" ? raw.mediaAssets : {};
    const composition = isMotion
      ? await buildMotionComposition(raw.motionPlan, raw.assetFiles ?? [])
      : await buildCreatorComposition(imported.manifest, mediaAssets);
    if (isCompose) {
      reply(response, 200, { ok: true, ...composition, warnings: imported.warnings });
      return true;
    }
    if (!composition.readiness.testRenderReady) {
      reply(response, 422, {
        ok: false, error: "CREATIVE_ASSETS_REQUIRED",
        blockers: composition.readiness.testRenderBlockers
      });
      return true;
    }
    if (typeof createJob !== "function") {
      reply(response, 503, { ok: false, error: "RENDER_QUEUE_UNAVAILABLE" });
      return true;
    }
    const job = await createJob({
      prompt: String(raw.topic || raw.title || "Forge Midjourney controlled render").slice(0, 2000),
      project: composition.project,
      projectFiles: composition.projectFiles,
      metadata: {
        source: "forge-midjourney-studio",
        mode: "controlled-test",
        qaStatus: "pending-technical-and-artistic-review",
        expectsAudio: isMotion ? composition.metadata.expectsAudio : Boolean(composition.readiness.audio.voiceover.attached),
        motionPlan: isMotion,
        approvedBy: "authenticated-admin-confirmation"
      }
    });
    reply(response, 202, {
      ok: true, jobId: job.id, status: job.status,
      statusUrl: "/api/studio/jobs/" + job.id,
      message: "Teste enviado ao Worker. O MP4 final exige revisão de qualidade antes de aprovação.",
      readiness: { ...composition.readiness, renderReady: false }
    });
  } catch (error) {
    const status = error.code === "INVALID_JOB" || error.code === "INVALID_PROJECT" ? 422 : 400;
    reply(response, status, { ok: false, error: error.message || "INVALID_CREATOR_PROJECT" });
  }
  return true;
}
