import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHyperFramesRenderEnvironment,
  collectRenderResources,
  isRecoverableRenderFailure,
  renderRetryDelayMs,
  resolveRenderMaxAttempts,
  shouldResumeHyperFramesSegments
} from "../src/render-recovery.mjs";
import { renderArgs } from "../src/renderers/hyperframes.mjs";

test("render recovery raises stale capture and Chrome timeouts to safe defaults", () => {
  const env = buildHyperFramesRenderEnvironment({
    HF_DE_STALL_MS: "60000",
    PRODUCER_PUPPETEER_PROTOCOL_TIMEOUT_MS: "90000",
    PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS: "60000",
    PRODUCER_PLAYER_READY_TIMEOUT_MS: "45000"
  });
  assert.equal(env.HF_DE_STALL_MS, "180000");
  assert.equal(env.PRODUCER_PUPPETEER_PROTOCOL_TIMEOUT_MS, "300000");
  assert.equal(env.PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS, "180000");
  assert.equal(env.PRODUCER_PLAYER_READY_TIMEOUT_MS, "120000");
});

test("render recovery enables short segments, browser recycling and resume by default", () => {
  const env = buildHyperFramesRenderEnvironment({});
  assert.equal(env.HF_SEGMENTED_CAPTURE, "true");
  assert.equal(env.HF_SEGMENTED_MIN_SECONDS, "10");
  assert.equal(env.HF_SEGMENT_FRAMES, "300");
  assert.equal(env.HF_SEGMENT_BROWSER_RECYCLE, "1");
  assert.equal(shouldResumeHyperFramesSegments(env), true);
  assert.ok(renderArgs({ project: { fps: 60 } }, "out.mp4", { resume: true }).includes("--resume"));
});

test("operator overrides are respected and segmentation can be disabled explicitly", () => {
  const env = buildHyperFramesRenderEnvironment({
    MEDIAFORGE_CAPTURE_STALL_MS: "240000",
    MEDIAFORGE_SEGMENTED_CAPTURE: "false",
    MEDIAFORGE_SEGMENT_FRAMES: "120"
  });
  assert.equal(env.HF_DE_STALL_MS, "240000");
  assert.equal(env.HF_SEGMENTED_CAPTURE, "false");
  assert.equal(shouldResumeHyperFramesSegments(env), false);
});

test("retry attempts shorten capture segments without lowering output quality settings", () => {
  const first = buildHyperFramesRenderEnvironment({}, 1);
  const second = buildHyperFramesRenderEnvironment({}, 2);
  assert.equal(first.HF_SEGMENT_FRAMES, "300");
  assert.equal(second.HF_SEGMENT_FRAMES, "150");
  assert.equal(second.HF_SEGMENTED_CAPTURE, "true");
  assert.equal(second.PRODUCER_LOW_MEMORY_MODE, undefined);
  const operatorOverride = buildHyperFramesRenderEnvironment({
    MEDIAFORGE_SEGMENT_FRAMES: "120"
  }, 2);
  assert.equal(operatorOverride.HF_SEGMENT_FRAMES, "120");
});

test("render retry classification distinguishes transient capture failures from authoring errors", () => {
  assert.equal(isRecoverableRenderFailure(new Error(
    "[Render] Sequential screenshot capture stalled: no frame progress for 180000ms"
  )), true);
  assert.equal(isRecoverableRenderFailure(new Error("Protocol error: Target closed")), true);
  assert.equal(isRecoverableRenderFailure(new Error("Error: out of memory allocating frame buffer")), true);
  assert.equal(isRecoverableRenderFailure(Object.assign(
    new Error("missing_timeline_registry: Missing window.__timelines registration"),
    { code: "HYPERFRAMES_FAILED" }
  )), false);
  assert.equal(isRecoverableRenderFailure(Object.assign(
    new Error("Chrome stopped answering"),
    { retryable: false }
  )), false);
});

test("render retry count is capped at three and uses bounded backoff", () => {
  assert.equal(resolveRenderMaxAttempts({}), 3);
  assert.equal(resolveRenderMaxAttempts({ MEDIAFORGE_RENDER_MAX_ATTEMPTS: "9" }), 3);
  assert.equal(resolveRenderMaxAttempts({ MEDIAFORGE_RENDER_MAX_ATTEMPTS: "1" }), 1);
  assert.equal(renderRetryDelayMs(1), 10_000);
  assert.equal(renderRetryDelayMs(2), 30_000);
});

test("resource snapshot reports memory, CPU, disk and explicitly unknown GPU utilization", async () => {
  const resources = await collectRenderResources(process.cwd());
  assert.ok(resources.cpu.logicalCores > 0);
  assert.ok(resources.systemMemory.totalBytes > 0);
  assert.ok(resources.processMemory.rssBytes > 0);
  assert.ok(resources.disk);
  assert.equal(resources.gpu.status, "not-measured");
  assert.equal(resources.gpu.utilization, null);
});
