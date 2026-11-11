import { importSalevoStudioDraft } from "./legacy-studio.mjs";
import { buildCreatorComposition } from "./creator-composer.mjs";

function reply(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

export async function handleStudioApi({ request, response, parseBody, isAdminSession }) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/api/studio/compose") return false;

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST", "cache-control": "no-store" });
    response.end();
    return true;
  }

  if (!(await isAdminSession(request))) {
    reply(response, 401, { ok: false, error: "AUTH_REQUIRED" });
    return true;
  }

  // Same-origin browser requests only: do not accept cross-site cookies as authorization.
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
    const imported = importSalevoStudioDraft(raw);
    const mediaAssets = raw.mediaAssets && typeof raw.mediaAssets === "object" ? raw.mediaAssets : {};
    const composition = await buildCreatorComposition(imported.manifest, mediaAssets);
    reply(response, 200, { ok: true, ...composition, warnings: imported.warnings });
  } catch (error) {
    reply(response, 400, { ok: false, error: error.message || "INVALID_CREATOR_PROJECT" });
  }
  return true;
}
