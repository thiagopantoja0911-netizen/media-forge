import { isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";

const RATIOS = new Set(["16:9", "9:16", "1:1"]);
const OUTPUTS = new Set(["video", "audio", "project"]);

function isSafeRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !isAbsolute(value)
    && !value.includes("\0")
    && !value.split(/[\\/]/).includes("..");
}

export function validateJob(input) {
  const errors = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["job must be an object"] };
  }

  if (typeof input.prompt !== "string" || input.prompt.trim().length < 3) {
    errors.push("prompt must be a non-empty string");
  }

  const project = input.project ?? {};
  if (typeof project.title !== "string" || project.title.trim().length < 1) {
    errors.push("project.title is required");
  }

  const duration = project.durationSeconds ?? 15;
  if (!Number.isFinite(duration) || duration < 1 || duration > 3600) {
    errors.push("project.durationSeconds must be between 1 and 3600");
  }

  if (!RATIOS.has(project.aspectRatio ?? "9:16")) {
    errors.push("project.aspectRatio must be 16:9, 9:16 or 1:1");
  }

  const outputs = project.outputs ?? ["video"];
  if (!Array.isArray(outputs) || outputs.length === 0 || outputs.some((item) => !OUTPUTS.has(item))) {
    errors.push("project.outputs may contain only video, audio or project");
  }

  if (project.voice && typeof project.voice !== "object") {
    errors.push("voice must be an object when provided");
  }

  if (project.renderer && !["hyperframes", "dry-run"].includes(project.renderer)) {
    errors.push("project.renderer must be hyperframes or dry-run");
  }

  if (project.sourceDir !== undefined && !isSafeRelativePath(project.sourceDir)) {
    errors.push("project.sourceDir must be a safe relative path");
  }

  if (project.outputName !== undefined
      && (!isSafeRelativePath(project.outputName) || project.outputName.includes("/") || project.outputName.includes("\\"))) {
    errors.push("project.outputName must be a safe filename");
  }

  return { ok: errors.length === 0, errors };
}

export async function readJobFile(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  const result = validateJob(value);
  if (!result.ok) {
    const error = new Error(result.errors.join("; "));
    error.code = "INVALID_JOB";
    throw error;
  }
  return value;
}

if (process.argv[1] && process.argv[1].endsWith("job-schema.mjs")) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node src/job-schema.mjs examples/job.json");
    process.exitCode = 1;
  } else {
    try {
      await readJobFile(path);
      console.log("Job valid");
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
