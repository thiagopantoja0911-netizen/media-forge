import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { renderWithHyperFrames } from "./renderers/hyperframes.mjs";

const dataDir = process.env.MEDIAFORGE_DATA_DIR ?? ".mediaforge";
const jobsDir = join(dataDir, "jobs");
const plansDir = join(dataDir, "plans");
const once = process.argv.includes("--once");
const intervalMs = Number(process.env.MEDIAFORGE_POLL_MS ?? 1500);
const rendererMode = process.env.MEDIAFORGE_RENDERER ?? "dry-run";

await mkdir(jobsDir, { recursive: true });
await mkdir(plansDir, { recursive: true });

async function save(job) {
  job.updatedAt = new Date().toISOString();
  await writeFile(join(jobsDir, job.id + ".json"), JSON.stringify(job, null, 2) + "\n");
}

async function nextQueuedJob() {
  const names = (await readdir(jobsDir)).filter((name) => name.endsWith(".json")).sort();
  for (const name of names) {
    const job = JSON.parse(await readFile(join(jobsDir, name), "utf8"));
    if (job.status === "queued") return job;
  }
  return null;
}

async function processJob(job) {
  job.status = "processing";
  job.progress = 10;
  await save(job);

  if (rendererMode === "hyperframes" && job.project.renderer === "hyperframes") {
    const result = await renderWithHyperFrames(job);
    job.status = "completed";
    job.progress = 100;
    job.result = result;
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
  await save(job);
  console.log("Prepared job " + job.id);
}

async function loop() {
  const job = await nextQueuedJob();
  if (job) {
    try {
      await processJob(job);
    } catch (error) {
      job.status = "failed";
      job.progress = 0;
      job.error = { message: error.message, code: error.code ?? "RENDER_FAILED" };
      await save(job);
      console.error("Job " + job.id + " failed: " + error.message);
    }
  }
  if (!once) setTimeout(loop, intervalMs);
}

await loop();
