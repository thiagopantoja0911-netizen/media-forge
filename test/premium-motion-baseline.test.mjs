import test from "node:test";
import assert from "node:assert/strict";
import { validatePremiumMotionSubmission, PREMIUM_MOTION_BASELINE } from "../src/premium-motion-baseline.mjs";

function sample(overrides = {}) {
  const root = [
    '<!doctype html><html><head><script src="assets/gsap.min.js"></script></head><body>',
    '<div data-composition-id="main" data-duration="16">',
    '<div class="clip" data-start="0" data-duration="4"></div>',
    '<div class="clip" data-start="4" data-duration="4"></div>',
    '<div class="clip" data-start="8" data-duration="4"></div>',
    '<div class="clip" data-start="12" data-duration="4"></div>',
    '<audio id="music" data-start="0" data-duration="16" src="https://music.example.test/bed.mp3"></audio>',
    '<audio id="whoosh" data-start="4" data-duration="1" src="assets/whoosh.wav"></audio>',
    '<audio id="impact" data-start="8" data-duration="1" src="assets/impact.wav"></audio>',
    '</div><script>window.__timelines={main:gsap.timeline({paused:true})};</script></body></html>'
  ].join("\n");
  return {
    duration_seconds: 16, aspect_ratio: "16:9", fps: 60, quality: "high", preflight: true,
    project_files: [
      { path: "index.html", content: root, encoding: "utf8" },
      { path: "assets/gsap.min.js", content: "window.gsap={};" },
      { path: "assets/whoosh.wav", content: "RIFF" },
      { path: "assets/impact.wav", content: "RIFF" }
    ],
    ...overrides
  };
}

test("premium motion accepts complete 1080p60 motion project with timed music and sound design", () => {
  const result = validatePremiumMotionSubmission(sample());
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.profile, PREMIUM_MOTION_BASELINE);
});

test("premium motion blocks low fps, draft rendering and disabled preflight", () => {
  const result = validatePremiumMotionSubmission(sample({fps:30,quality:"draft",preflight:false}));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /60 FPS/);
  assert.match(result.errors.join(" "), /high or delivery/);
  assert.match(result.errors.join(" "), /cannot be disabled/);
});

test("premium motion blocks missing GSAP runtime, silent films, and missing clips", () => {
  const noGsap = sample();
  noGsap.project_files = noGsap.project_files.filter(file => file.path !== "assets/gsap.min.js");
  assert.match(validatePremiumMotionSubmission(noGsap).errors.join(" "), /bundle the referenced GSAP/);

  const noAudio = sample();
  noAudio.project_files[0].content = noAudio.project_files[0].content.replace(/<audio\b[^>]*><\/audio>/g, "");
  assert.match(validatePremiumMotionSubmission(noAudio).errors.join(" "), /musical bed/);

  const fewerClips = sample();
  fewerClips.project_files[0].content = fewerClips.project_files[0].content.replace(/<div class="clip"[^>]*><\/div>/g, "");
  assert.match(validatePremiumMotionSubmission(fewerClips).errors.join(" "), /four timed visual/);
});

test("premium motion detects missing local sound assets, duplicate tracks and soundtrack gaps", () => {
  const missing = sample();
  missing.project_files = missing.project_files.filter(file => file.path !== "assets/whoosh.wav");
  assert.match(validatePremiumMotionSubmission(missing).errors.join(" "), /missing packaged audio/);

  const duplicate = sample();
  duplicate.project_files[0].content = duplicate.project_files[0].content.replace('src="assets/impact.wav"','src="assets/whoosh.wav"');
  assert.match(validatePremiumMotionSubmission(duplicate).errors.join(" "), /three distinct/);

  const shortBed = sample();
  shortBed.project_files[0].content = shortBed.project_files[0].content.replace('data-duration="16" src="https://music','data-duration="11" src="https://music');
  assert.match(validatePremiumMotionSubmission(shortBed).errors.join(" "), /must cover the film/);
});

test("premium motion inspects HTML sent as base64", () => {
  const payload = sample();
  const source = payload.project_files[0];
  source.content = Buffer.from(source.content, "utf8").toString("base64");
  source.encoding = "base64";
  assert.equal(validatePremiumMotionSubmission(payload).ok, true);
});
