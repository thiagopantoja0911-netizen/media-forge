import { cpus, freemem, loadavg, platform, totalmem } from "node:os";
import { statfs } from "node:fs/promises";

const DEFAULT_CAPTURE_STALL_MS = 180_000;
const DEFAULT_PROTOCOL_TIMEOUT_MS = 300_000;
const DEFAULT_PAGE_NAVIGATION_TIMEOUT_MS = 180_000;
const DEFAULT_PLAYER_READY_TIMEOUT_MS = 120_000;
const DEFAULT_SEGMENT_MIN_SECONDS = 10;
const DEFAULT_SEGMENT_FRAMES = 300;
const DEFAULT_SEGMENT_BROWSER_RECYCLE = 1;
const DEFAULT_RETRY_SEGMENT_FRAMES = 150;
const MAX_RENDER_ATTEMPTS = 3;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredBudget(env, overrideName, upstreamName, minimum) {
  const explicit = positiveInteger(env[overrideName], null);
  if (explicit !== null) return explicit;
  return Math.max(minimum, positiveInteger(env[upstreamName], minimum));
}

function isDisabled(value) {
  return ["false", "0", "off", "no"].includes(String(value ?? "").trim().toLowerCase());
}

/**
 * Conservative defaults for Windows/Chrome capture. Explicit MEDIAFORGE_*
 * values are operator overrides; older upstream values cannot silently keep
 * the old 60-second watchdog in place.
 */
export function buildHyperFramesRenderEnvironment(base = process.env, attempt = 1) {
  const env = { ...base };

  env.HF_DE_STALL_MS = String(configuredBudget(
    env, "MEDIAFORGE_CAPTURE_STALL_MS", "HF_DE_STALL_MS", DEFAULT_CAPTURE_STALL_MS
  ));
  env.PRODUCER_PUPPETEER_PROTOCOL_TIMEOUT_MS = String(configuredBudget(
    env, "MEDIAFORGE_PROTOCOL_TIMEOUT_MS",
    "PRODUCER_PUPPETEER_PROTOCOL_TIMEOUT_MS", DEFAULT_PROTOCOL_TIMEOUT_MS
  ));
  env.PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS = String(configuredBudget(
    env, "MEDIAFORGE_PAGE_NAVIGATION_TIMEOUT_MS",
    "PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS", DEFAULT_PAGE_NAVIGATION_TIMEOUT_MS
  ));
  env.PRODUCER_PLAYER_READY_TIMEOUT_MS = String(configuredBudget(
    env, "MEDIAFORGE_PLAYER_READY_TIMEOUT_MS",
    "PRODUCER_PLAYER_READY_TIMEOUT_MS", DEFAULT_PLAYER_READY_TIMEOUT_MS
  ));

  const segmented = !isDisabled(env.MEDIAFORGE_SEGMENTED_CAPTURE)
    && !isDisabled(env.HF_SEGMENTED_CAPTURE);
  env.HF_SEGMENTED_CAPTURE = segmented ? "true" : "false";
  if (segmented) {
    env.HF_SEGMENTED_MIN_SECONDS = String(positiveInteger(
      env.MEDIAFORGE_SEGMENT_MIN_SECONDS,
      positiveInteger(env.HF_SEGMENTED_MIN_SECONDS, DEFAULT_SEGMENT_MIN_SECONDS)
    ));
    env.HF_SEGMENT_FRAMES = String(positiveInteger(
      env.MEDIAFORGE_SEGMENT_FRAMES,
      positiveInteger(env.HF_SEGMENT_FRAMES, DEFAULT_SEGMENT_FRAMES)
    ));
    env.HF_SEGMENT_BROWSER_RECYCLE = String(positiveInteger(
      env.MEDIAFORGE_SEGMENT_BROWSER_RECYCLE,
      positiveInteger(env.HF_SEGMENT_BROWSER_RECYCLE, DEFAULT_SEGMENT_BROWSER_RECYCLE)
    ));
  }

  // Retries use shorter segments to reduce peak browser/frame memory.
  // This is a documented HyperFrames control; output resolution, FPS, quality
  // and authored motion remain unchanged.
  if (attempt > 1 && segmented) {
    const currentFrames = positiveInteger(env.HF_SEGMENT_FRAMES, DEFAULT_SEGMENT_FRAMES);
    const retryFrames = positiveInteger(
      env.MEDIAFORGE_RETRY_SEGMENT_FRAMES,
      DEFAULT_RETRY_SEGMENT_FRAMES
    );
    env.HF_SEGMENT_FRAMES = String(Math.min(currentFrames, retryFrames));
  }
  return env;
}

export function shouldResumeHyperFramesSegments(env = process.env) {
  return !isDisabled(env.MEDIAFORGE_SEGMENTED_CAPTURE)
    && !isDisabled(env.HF_SEGMENTED_CAPTURE);
}

export function resolveRenderMaxAttempts(env = process.env) {
  return Math.min(MAX_RENDER_ATTEMPTS, Math.max(1,
    positiveInteger(env.MEDIAFORGE_RENDER_MAX_ATTEMPTS, MAX_RENDER_ATTEMPTS)
  ));
}

export function isRecoverableRenderFailure(error) {
  if (!error || error.retryable === false) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? error);
  if (/HYPERFRAMES_PREFLIGHT_FAILED|VIDEO_TECHNICAL_QA_FAILED|AUDIO_MIX_QA_FAILED/.test(code)) return false;
  if (/missing_timeline_registry|gsap_css_transform_conflict|outside_frame|invalid composition|unknown option/i.test(message)) return false;
  return /capture stalled|chrome stopped answering|target closed|target crashed|session closed|browser.*disconnected|protocol error|timed? ?out|ETIMEDOUT|ECONNRESET|EPIPE|out of memory|heap.*exhaust|memory exhaustion|allocation failed/i.test(message);
}

export function renderRetryDelayMs(completedAttempt) {
  return completedAttempt <= 1 ? 10_000 : 30_000;
}

/** Best-effort resource snapshot; GPU utilization is explicitly unverified. */
export async function collectRenderResources(diskPath) {
  const total = totalmem();
  const free = freemem();
  const memory = process.memoryUsage();
  let disk = null;
  try {
    const stats = await statfs(diskPath);
    const blockSize = Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * blockSize;
    const freeBytes = Number(stats.bavail ?? stats.bfree) * blockSize;
    disk = {
      totalBytes,
      freeBytes,
      usedPercent: totalBytes > 0 ? Math.round((1 - freeBytes / totalBytes) * 1000) / 10 : null
    };
  } catch (error) {
    disk = { unavailable: true, reason: String(error?.message ?? error).slice(0, 240) };
  }

  return {
    collectedAt: new Date().toISOString(),
    cpu: {
      logicalCores: cpus().length,
      loadAverage: platform() === "win32" ? null : loadavg()
    },
    systemMemory: {
      totalBytes: total,
      freeBytes: free,
      usedPercent: total > 0 ? Math.round((1 - free / total) * 1000) / 10 : null
    },
    processMemory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external
    },
    disk,
    gpu: {
      utilization: null,
      status: "not-measured",
      note: "GPU utilization requires a vendor-specific telemetry provider; no GPU percentage is inferred."
    }
  };
}
