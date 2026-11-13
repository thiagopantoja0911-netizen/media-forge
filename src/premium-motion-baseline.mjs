// Minimum production floor for premium animated ads submitted through create_video.
// This catches structural regressions, not subjective visual or musical quality.
export const PREMIUM_MOTION_BASELINE = "premium-motion-v1";

function attr(tag, name) {
  const found = tag.match(new RegExp("\\b" + name + "\\s*=\\s*([\"'])(.*?)\\1", "i"));
  return found?.[2] ?? null;
}

function getIndexHtml(files) {
  const source = Array.isArray(files) && files.find(file => file?.path === "index.html");
  if (!source || typeof source.content !== "string") return "";
  if (source.encoding === "base64") {
    try { return Buffer.from(source.content, "base64").toString("utf8"); }
    catch { return ""; }
  }
  return source.content;
}

export function validatePremiumMotionSubmission(args) {
  const errors = [];
  const files = Array.isArray(args?.project_files) ? args.project_files : [];
  const html = getIndexHtml(files);
  const fps = args?.fps ?? 60;
  const quality = args?.quality ?? "high";
  if (Number(fps) < 60 || !Number.isFinite(Number(fps))) {
    errors.push("Premium Motion: use at least 60 FPS (or explicitly choose the study profile).");
  }
  if (!["high", "delivery"].includes(quality)) {
    errors.push("Premium Motion: quality must be high or delivery.");
  }
  if (args?.preflight === false) {
    errors.push("Premium Motion: HyperFrames preflight cannot be disabled.");
  }
  if (!html) {
    errors.push("Premium Motion: index.html must be provided as UTF-8 or base64.");
    return { ok: false, errors, profile: PREMIUM_MOTION_BASELINE };
  }
  if (!/data-composition-id\s*=\s*["']/.test(html) || !/data-duration\s*=\s*["']/.test(html)) {
    errors.push("Premium Motion: project needs a timed HyperFrames composition.");
  }
  const visualClips = [...html.matchAll(/<(?:div|video|img)\b[^>]*\bclass\s*=\s*["'][^"']*\bclip\b[^"']*["'][^>]*>/gi)];
  if (visualClips.length < 4) {
    errors.push("Premium Motion: at least four timed visual elements are required for a deliberate sequence.");
  }
  if (!/\bgsap\s*\./.test(html) && !/<video\b/i.test(html)) {
    errors.push("Premium Motion: include meaningful GSAP motion or real moving video.");
  }
  if (/\bgsap\s*\./.test(html)) {
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => attr(m[0], "src")).filter(Boolean);
    const gsapScripts = scripts.filter(src => /gsap[^/]*\.js(?:[?#].*)?$/i.test(src));
    if (!gsapScripts.some(src => src.startsWith("assets/") && files.some(f => f?.path === src))) {
      errors.push("Premium Motion: bundle the referenced GSAP script as a project file; no missing or network-only runtime.");
    }
  }
  const audio = [...html.matchAll(/<audio\b[^>]*>/gi)].map(m => m[0]);
  if (audio.length < 3) {
    errors.push("Premium Motion: package a musical bed plus at least two timed SFX cues.");
  } else {
    const sources = audio.map(tag => attr(tag, "src")).filter(Boolean);
    const distinct = new Set(sources);
    if (sources.length < audio.length || distinct.size < 3) {
      errors.push("Premium Motion: audio cues need valid sources and at least three distinct media sources.");
    }
    if (!audio.some(tag => Number(attr(tag, "data-start")) === 0
        && Number(attr(tag, "data-duration")) >= Number(args?.duration_seconds ?? 15) - 0.5)) {
      errors.push("Premium Motion: one musical bed must cover the film from frame zero to the end.");
    }
    if (sources.some(src => !src.startsWith("assets/") && !/^https:\/\//i.test(src))) {
      errors.push("Premium Motion: sound sources must be packaged assets/ files or HTTPS.");
    }
    for (const src of sources.filter(src => src.startsWith("assets/"))) {
      if (!files.some(f => f?.path === src)) errors.push("Premium Motion: missing packaged audio asset: " + src);
    }
  }
  return { ok: errors.length === 0, errors, profile: PREMIUM_MOTION_BASELINE };
}
