import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TEST_COMPOSITION_INDEX_HTML,
  TEST_COMPOSITION_SCENE_HTML,
  getTestCompositionFiles
} from "../src/test-composition.mjs";

test("MediaForge smoke-test root mounts a valid HyperFrames subcomposition", () => {
  const index = TEST_COMPOSITION_INDEX_HTML;
  const scene = TEST_COMPOSITION_SCENE_HTML;

  assert.match(index, /id="root"/);
  assert.match(index, /data-composition-id="main"/);
  assert.match(index, /data-duration="10"/);
  assert.match(index, /data-width="3840"/);
  assert.match(index, /data-height="2160"/);
  assert.match(index, /id="test-scene"[\s\S]*?data-composition-id="test-scene"/);
  assert.match(index, /data-composition-src="compositions\/test-scene\.html"/);
  assert.match(index, /<script src="assets\/gsap\.min\.js"><\/script>/);
  assert.ok(index.indexOf('src="assets/gsap.min.js"') < index.indexOf('window.__timelines["main"]'));
  assert.match(index, /window\.__timelines\["main"\] = gsap\.timeline\(\{ paused: true \}\)/);
  assert.doesNotMatch(index, /cdn\.jsdelivr\.net|unpkg\.com/);

  assert.match(scene, /^<template>/);
  assert.match(scene, /id="root"[\s\S]*?data-composition-id="test-scene"/);
  assert.match(scene, /data-width="3840"/);
  assert.match(scene, /data-height="2160"/);
  assert.match(scene, /data-duration="10"/);
  assert.match(scene, /font-size: 64px/);
  assert.match(scene, /Pipeline de renderização/);
  assert.match(scene, /HyperFrames · composição, timeline e render/);
  assert.match(scene, /window\.__timelines\["test-scene"\] = timeline/);
  assert.ok(scene.indexOf('window.__timelines["test-scene"] = timeline')
    > scene.lastIndexOf("timeline.fromTo("),
  "scene timeline must be registered after every tween is added");
  assert.doesNotMatch(scene, /renderizaÃ|composiÃ|Â·/);
  assert.doesNotMatch(scene, /transform:\s*scaleX/);
  assert.doesNotMatch(scene, /Date\.now\(|Math\.random\(|setTimeout\(|setInterval\(|fetch\(/);
});

test("smoke-test bundle includes local GSAP and all scene files", async () => {
  const files = await getTestCompositionFiles();
  assert.deepEqual(files.map((file) => file.path), [
    "index.html",
    "compositions/test-scene.html",
    "assets/gsap.min.js"
  ]);
  const gsap = files.find((file) => file.path === "assets/gsap.min.js").content;
  assert.match(gsap, /GSAP 3\.15\.1/);
  assert.ok(gsap.length > 50_000, "the vendored GSAP browser build must not be empty or truncated");
});

test("dashboard smoke-test job requests 4K60 High and sends the full composition bundle", async () => {
  const panel = await readFile(new URL("../src/panel.mjs", import.meta.url), "utf8");
  const routeStart = panel.indexOf('path === "/api/test-job"');
  assert.notEqual(routeStart, -1);
  const route = panel.slice(routeStart, panel.indexOf("send(response, 404", routeStart));
  assert.match(route, /resolution: "4k"/);
  assert.match(route, /fps: 60/);
  assert.match(route, /quality: "high"/);
  assert.match(route, /project_files: await getTestCompositionFiles\(\)/);
});
