import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { renderWithHyperFrames } from "./renderers/hyperframes.mjs";

const dataDir = process.env.MEDIAFORGE_DATA_DIR ?? ".mediaforge";
const jobsDir = join(dataDir, "jobs");
const plansDir = join(dataDir, "plans");
const workerStatusFile = join(dataDir, "worker-status.json");
const workerId = process.env.MEDIAFORGE_WORKER_ID ?? randomUUID();
const once = process.argv.includes("--once");
const intervalMs = Number(process.env.MEDIAFORGE_POLL_MS ?? 1500);
const rendererMode = process.env.MEDIAFORGE_RENDERER ?? "dry-run";
const configuredRetries = Number(process.env.MEDIAFORGE_MAX_RETRIES ?? 2);
const maxRetries = Number.isFinite(configuredRetries) ? Math.max(0, Math.floor(configuredRetries)) : 2;

await mkdir(jobsDir, { recursive: true });
await mkdir(plansDir, { recursive: true });

async function writeWorkerStatus() {
  await writeFile(workerStatusFile, JSON.stringify({
    workerId,
    renderer: rendererMode,
    lastSeen: new Date().toISOString()
  }) + "\n");
}

async function save(job) {
  job.updatedAt = new Date().toISOString();
  await writeFile(join(jobsDir, job.id + ".json"), JSON.stringify(job, null, 2) + "\n");
}

async function nextQueuedJob() {
  const names = (await readdir(jobsDir)).filter((name) => name.endsWith(".json")).sort();
  const now = Date.now();
  for (const name of names) {
    const job = JSON.parse(await readFile(join(jobsDir, name), "utf8"));
    if (job.status !== "queued") continue;
    if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now) continue;
    return job;
  }
  return null;
}

async function processJob(job) {
  job.status = "processing";
  job.attempts = (job.attempts ?? 0) + 1;
  job.progress = 10;
  delete job.nextAttemptAt;
  await save(job);

  if (rendererMode === "hyperframes" && job.project.renderer === "hyperframes") {
    const result = await renderWithHyperFrames(job);
    job.status = "completed";
    job.progress = 100;
    job.result = result;
    delete job.error;
    await save(job);
    console.log("Rendered job " + job.id);
    return;
  }

  const plan = {
    id: randomUUID(),
    jobId: job.id,
    renderer: job.project.renderer,
    stages: [
      "parse-prompt",
      "prepare-assets",
      "generate-voice",
      "compose-hyperframes",
      "quality-gate",
      "render-video",
      "export-local-files"
    ],
    project: job.project,
    voice: job.voice,
    assets: job.assets
  };

  await writeFile(join(plansDir, job.id + ".json"), JSON.stringify(plan, null, 2) + "\n");

  job.status = "completed";
  job.progress = 100;
  job.result = {
    mode: "dry-run",
    planPath: join(plansDir, job.id + ".json"),
    note: "Renderer adapter not enabled; this job produced a validated execution plan."
  };
  delete job.error;
  await save(job);
  console.log("Prepared job " + job.id);
}

async function loop() {
  await writeWorkerStatus();
  const job = await nextQueuedJob();
  if (job) {
    try {
      await processJob(job);
    } catch (error) {
      job.error = { message: error.message, code: error.code ?? "RENDER_FAILED" };
      if ((job.attempts ?? 0) <= maxRetries) {
        job.status = "queued";
        job.progress = 0;
        job.nextAttemptAt = new Date(Date.now() + intervalMs).toISOString();
        job.error.retrying = true;
      } else {
        job.status = "failed";
        job.progress = 0;
      }
      await save(job);
      console.error("Job " + job.id + " failed: " + error.message);
    }
  }
  if (!once) setTimeout(loop, intervalMs);
}

await loop();
