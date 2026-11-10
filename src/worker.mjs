import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = process.env.MEDIAFORGE_DATA_DIR ?? ".mediaforge";
const jobsDir = join(dataDir, "jobs");
const plansDir = join(dataDir, "plans");
const once = process.argv.includes("--once");
const intervalMs = Number(process.env.MEDIAFORGE_POLL_MS ?? 1500);

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
    note: "Renderer adapter not connected yet; this job produced a validated execution plan."
  };
  await save(job);
  console.log("Prepared job " + job.id);
}

async function loop() {
  const job = await nextQueuedJob();
  if (job) await processJob(job);
  if (!once) setTimeout(loop, intervalMs);
}

await loop();
