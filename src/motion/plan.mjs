// Frame-based authoring contract. Evidence and creative approval are deliberately separate.
export const SCENE_TYPES = ["kinetic", "widget", "product", "collage", "end-card"];
export const TRANSITIONS = ["cut", "push", "iris"];
const identifier = /^[a-z][a-z0-9-]{0,47}$/;
const assetPath = /^assets\/[a-zA-Z0-9_./-]+$/;
const isAsset = value => typeof value === "string" && assetPath.test(value) && !value.split("/").includes("..");
export function fpsValue(value) {
  const [n, d = "1"] = String(value).split("/");
  return Number(n) / Number(d);
}
export function frameSeconds(frame, fps) { return frame / fpsValue(fps); }

export function validateMotionPlan(plan) {
  const errors = [], warnings = [];
  const fail = text => errors.push(text);
  if (!plan || plan.format !== "mediaforge-motion-v1") return { ok: false, errors: ["Expected mediaforge-motion-v1"], warnings };
  const fps = fpsValue(plan.fps);
  if (!/^(?:\d+|\d+\/\d+)$/.test(String(plan.fps)) || !Number.isFinite(fps) || fps < 1 || fps > 120) fail("fps must be 1..120, optionally rational");
  if (!Number.isInteger(plan.totalFrames) || plan.totalFrames < 1 || plan.totalFrames > fps * 120) fail("totalFrames must describe 0..120 seconds");
  if (!Number.isInteger(plan.width) || !Number.isInteger(plan.height) || plan.width < 256 || plan.height < 256 || plan.width > 3840 || plan.height > 3840 || plan.width % 2 || plan.height % 2) fail("width/height must be even integers in 256..3840");
  if (![1,9/16,16/9].some(r=>Math.abs(plan.width/plan.height-r)<.001)) fail("This composer supports 9:16, 16:9 and 1:1; keep other reference ratios in the evidence inventory");
  if (typeof plan.title !== "string" || !plan.title.trim() || plan.title.length > 160) fail("title is required, max 160 characters");
  if (!["silent-study", "sound-design", "voice-led"].includes(plan.audioMode)) fail("Choose audioMode: silent-study, sound-design or voice-led");
  if (plan.palette && Object.values(plan.palette).some(v => !/^#[0-9a-f]{6}$/i.test(v))) fail("palette values must be six-digit hex colors");
  const scenes = plan.scenes;
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > 16) return { ok: false, errors: [...errors, "Provide 1..16 scenes"], warnings };
  let cursor = 0;
  const ids = new Set(), eventFrames = new Map();
  for (const [index, scene] of scenes.entries()) {
    if (!scene || typeof scene !== "object") { fail(`scene ${index} must be an object`); continue; }
    if (!identifier.test(scene.id) || ids.has(scene.id)) fail(`scene ${index}: unique lowercase id required`);
    ids.add(scene.id);
    if (!SCENE_TYPES.includes(scene.type)) fail(`${scene.id}: unsupported scene type`);
    if (scene.startFrame !== cursor || !Number.isInteger(scene.endFrame) || scene.endFrame <= cursor || scene.endFrame > plan.totalFrames) fail(`${scene.id}: scenes must be contiguous, ordered and inside totalFrames`);
    const length = scene.endFrame - scene.startFrame;
    cursor = scene.endFrame;
    if (typeof scene.headline !== "string" || !scene.headline.trim() || scene.headline.length > 72) fail(`${scene.id}: headline must contain 1..72 characters`);
    for (const field of ["eyebrow", "detail", "metricLabel", "controlLabel"]) if (scene[field] !== undefined && (typeof scene[field] !== "string" || scene[field].length > 100)) fail(`${scene.id}: ${field} max 100 characters`);
    if (scene.media !== undefined && !isAsset(scene.media)) fail(`${scene.id}: media must be a local assets/ path`);
    if (["product", "collage"].includes(scene.type) && !scene.media) fail(`${scene.id}: ${scene.type} requires a supplied image (no invented product)`);
    if (!TRANSITIONS.includes(scene.transition ?? "cut")) fail(`${scene.id}: unsupported transition`);
    if ((scene.transition ?? "cut") !== "cut" && length < fps * .8) fail(`${scene.id}: transition needs at least 0.8 seconds`);
    if (!Array.isArray(scene.events) || !scene.events.length || scene.events.length > 24) { fail(`${scene.id}: provide 1..24 timed events`); continue; }
    let previous = -1;
    for (const event of scene.events) {
      if (!event || !identifier.test(event.id) || eventFrames.has(event.id)) { fail(`${scene.id}: events need unique lowercase ids`); continue; }
      if (!["enter", "state", "focus", "exit"].includes(event.action)) fail(`${event.id}: unsupported action`);
      if (![event.startFrame, event.peakFrame, event.endFrame].every(Number.isInteger) || event.startFrame < 0 || event.startFrame < previous || event.peakFrame <= event.startFrame || event.endFrame < event.peakFrame || event.endFrame >= length) fail(`${event.id}: require ordered local start < peak <= end within the scene`);
      if (event.value !== undefined && (!Number.isFinite(event.value) || event.value < 0 || event.value > 100)) fail(`${event.id}: value must be 0..100`);
      if (event.action === "state" && scene.type !== "widget") fail(`${event.id}: state action is for widgets`);
      previous = event.startFrame;
      eventFrames.set(event.id, scene.startFrame + event.peakFrame);
    }
    const words = String(scene.headline ?? "").trim().split(/\s+/).length;
    if (length / fps < .5 + words * .18) warnings.push(`${scene.id}: check reading time at phone size`);
    if (scene.type === "widget" && !scene.events.some(e => e?.action === "state")) warnings.push(`${scene.id}: widget has no state change`);
  }
  if (cursor !== plan.totalFrames) fail("Timeline must end at totalFrames");
  if (scenes.length >= 3 && new Set(scenes.map(s => s?.type)).size < 3) warnings.push("Low scene variety: review repeated layouts");
  if ((scenes.at(-1)?.endFrame - scenes.at(-1)?.startFrame) / fps < 1.5) warnings.push("End card has less than 1.5 seconds to resolve");
  const cues = plan.audioCues ?? [];
  if (!Array.isArray(cues) || cues.length > 32) fail("audioCues must be an array of at most 32 cues");
  else {
    const cueIds = new Set();
    for (const cue of cues) {
      if (!cue || !identifier.test(cue.id) || cueIds.has(cue.id)) { fail("audio cues require unique lowercase ids"); continue; }
      cueIds.add(cue.id);
      if (!isAsset(cue.src)) fail(`${cue.id}: audio must be a local assets/ path`);
      if (!["music", "voice", "sfx"].includes(cue.role)) fail(`${cue.id}: invalid audio role`);
      if (!Number.isInteger(cue.startFrame) || !Number.isInteger(cue.endFrame) || cue.startFrame < 0 || cue.endFrame <= cue.startFrame || cue.endFrame > plan.totalFrames) fail(`${cue.id}: audio outside timeline`);
      if (!Number.isFinite(cue.volume) || cue.volume < 0 || cue.volume > 1) fail(`${cue.id}: volume must be 0..1`);
      if (typeof cue.provenance !== "string" || !cue.provenance.trim()) fail(`${cue.id}: record source/license or ownership`);
      if (cue.role === "sfx") {
        const anchor = eventFrames.get(cue.eventId);
        if (anchor === undefined) fail(`${cue.id}: sfx must reference a visible eventId`);
        else if (Math.abs(cue.startFrame - anchor) > Math.ceil(fps * .08)) warnings.push(`${cue.id}: sound is more than 80ms from its visual peak`);
      }
    }
    if (plan.audioMode === "silent-study" && cues.length) fail("silent-study cannot contain audio cues");
    if (plan.audioMode !== "silent-study" && !cues.length) fail("Sound design requires actual audio cues and files");
    if (plan.audioMode === "voice-led" && !cues.some(c => c?.role === "voice")) fail("voice-led requires narration");
    if (plan.audioMode === "silent-study") warnings.push("Silent visual study: sound design and mix are pending");
    else if (cues.length && Math.max(...cues.map(c => c?.endFrame ?? 0)) < plan.totalFrames - fps * .5) warnings.push("Audio ends more than 0.5 seconds before the picture");
  }
  return { ok: errors.length === 0, errors, warnings, artisticReview: "pending" };
}

export function requireMotionPlan(plan) {
  const result = validateMotionPlan(plan);
  if (!result.ok) throw Object.assign(new Error(result.errors.join("; ")), { code: "INVALID_MOTION_PLAN", retryable: false });
  return result;
}
