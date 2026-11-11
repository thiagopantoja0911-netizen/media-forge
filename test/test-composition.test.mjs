import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_COMPOSITION_HTML } from "../src/test-composition.mjs";

test("MediaForge smoke-test composition satisfies the HyperFrames root and timeline contract", () => {
  assert.match(TEST_COMPOSITION_HTML, /id="root"/);
  assert.match(TEST_COMPOSITION_HTML, /data-composition-id="main"/);
  assert.match(TEST_COMPOSITION_HTML, /data-start="0"/);
  assert.match(TEST_COMPOSITION_HTML, /data-duration="10"/);
  assert.match(TEST_COMPOSITION_HTML, /data-width="3840"/);
  assert.match(TEST_COMPOSITION_HTML, /data-height="2160"/);
  assert.match(TEST_COMPOSITION_HTML, /class="clip" data-start="0" data-duration="10"/);
  assert.match(TEST_COMPOSITION_HTML, /gsap\.timeline\(\{ paused: true \}\)/);
  assert.match(TEST_COMPOSITION_HTML, /window\.__timelines\["main"\] = timeline/);
  assert.doesNotMatch(TEST_COMPOSITION_HTML, /transform:\s*scaleX/,
    "the GSAP-animated progress element must not define a competing CSS transform");
  assert.ok(TEST_COMPOSITION_HTML.indexOf('window.__timelines["main"] = timeline')
    > TEST_COMPOSITION_HTML.lastIndexOf("timeline.fromTo("),
  "the timeline must be registered after all tweens are built");
  assert.doesNotMatch(TEST_COMPOSITION_HTML, /Date\.now\(|Math\.random\(|setTimeout\(|setInterval\(|fetch\(/);
});

test("dashboard smoke-test job requests 4K60 High and uses the valid composition fixture", async () => {
  const panel = await readFile(new URL("../src/panel.mjs", import.meta.url), "utf8");
  const routeStart = panel.indexOf('path === "/api/test-job"');
  assert.notEqual(routeStart, -1);
  const route = panel.slice(routeStart, panel.indexOf('send(response, 404', routeStart));
  assert.match(route, /resolution: "4k"/);
  assert.match(route, /fps: 60/);
  assert.match(route, /quality: "high"/);
  assert.match(route, /content: TEST_COMPOSITION_HTML/);
});
