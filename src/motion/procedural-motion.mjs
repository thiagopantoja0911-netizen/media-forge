// Cinematic procedural motion is an explicit production path, never a way to
// silently lower the footage requirement for media-first videos.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateDynamicMotionPlan } from "./dynamic-motion-gate.mjs";

const SELECTOR = /^#[A-Za-z][A-Za-z0-9_-]*$/;
const MEANINGFUL = new Set(["camera", "ui", "scene", "foreground", "midground", "transition"]);

export function reviewProceduralMotion(plan) {
  const enabled = plan?.visualMode === "procedural-motion";
  if (!enabled) return { enabled: false, ok: true, issues: [], metrics: null };
  const issues = [];
  if (plan?.productionMode !== "cinematic") issues.push("procedural-motion requires productionMode=cinematic");
  if (plan?.profile !== "dynamic-motion-v1") issues.push("procedural-motion requires profile=dynamic-motion-v1");
  if (plan?.format !== "mediaforge-motion-v1") issues.push("procedural-motion requires format=mediaforge-motion-v1");
  if (!Number.isFinite(plan?.durationSeconds) ||
      Math.abs(plan.durationSeconds - plan.totalFrames / Number(plan.fps)) > 1 / Number(plan.fps))
    issues.push("procedural-motion durationSeconds must match totalFrames/fps");
  const gate = validateDynamicMotionPlan(plan);
  issues.push(...gate.issues);
  const ratio = gate.metrics?.plannedActiveRatio ?? 0;
  if (ratio < 0.75) issues.push("procedural-motion requires >=75% meaningful planned coverage");
  const targets = (plan.events || []).filter(e => MEANINGFUL.has(e?.scope)).map(e => e?.target);
  if (targets.some(t => !SELECTOR.test(t))) issues.push("procedural-motion events require simple concrete #id targets");
  const requiredScopes = ["camera", "scene", "foreground"];
  for (const scope of requiredScopes)
    if (!(plan.events || []).some(e => e?.scope === scope)) issues.push("procedural-motion needs " + scope + " actions");
  return { enabled, ok: issues.length === 0, issues, metrics: gate.metrics };
}

// Source-level evidence, not a replacement for pixel inspection after export.
export async function inspectProceduralMotionSource(projectDir, plan) {
  const review = reviewProceduralMotion(plan);
  if (!review.enabled) return review;
  const issues = [...review.issues];
  let markup = "";
  try { markup = await readFile(join(projectDir, "index.html"), "utf8"); }
  catch { issues.push("procedural-motion requires the actual editable index.html"); }
  if (!/<script\b[^>]*src=["']assets\/gsap\.min\.js["']/i.test(markup))
    issues.push("procedural-motion requires packaged local GSAP");
  try {
    if ((await stat(join(projectDir, "assets", "gsap.min.js"))).size < 50000)
      issues.push("packaged GSAP is suspiciously small");
  } catch { issues.push("GSAP file is missing"); }
  if (!/window\.__timelines(?:\.|\[)/.test(markup) || !/gsap\.timeline\(/.test(markup))
    issues.push("procedural-motion must register a seekable GSAP timeline");
  const domIds = new Set([...markup.matchAll(/\bid=["']([A-Za-z][A-Za-z0-9_-]*)["']/g)].map(m => m[1]));
  for (const target of new Set((plan.events || []).map(e => e.target))) {
    if (SELECTOR.test(target) && !domIds.has(target.slice(1))) issues.push("missing real motion target " + target);
  }
  const animated = new Set([...markup.matchAll(/\b(?:tl|timeline)\.(?:fromTo|to)\(\s*["'](#[A-Za-z][A-Za-z0-9_-]*)["']/g)].map(m => m[1]));
  if (animated.size < 3) issues.push("procedural-motion needs three independently tweened real targets");
  const byScope = (scope) => (plan.events || []).filter(e => e.scope === scope).some(e => animated.has(e.target));
  for (const scope of ["camera", "scene", "foreground"]) {
    if (!byScope(scope)) issues.push("no concrete GSAP tween found for " + scope + " event targets");
  }
  return { ...review, ok: issues.length === 0, issues, sourceTargets: animated.size };
}
