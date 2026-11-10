import { isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";

const RATIOS = new Set(["16:9", "9:16", "1:1"]);
const OUTPUTS = new Set(["video", "audio", "project"]);
export const MAX_PROJECT_FILES = 80;
export const MAX_PROJECT_BYTES = 24 * 1024 * 1024;

export function isSafeRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !isAbsolute(value)
    && !value.includes("\0")
    && !value.split(/[\\/]/).includes("..");
}

function fileBytes(file) {
  if (typeof file.content === "string") return Buffer.byteLength(file.content, "utf8");
  if (typeof file.contentBase64 === "string") return Buffer.from(file.contentBase64, "base64").byteLength;
  return 0;
}

export function validateProjectFiles(files) {
  const errors = [];
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, errors: ["projectFiles must be a non-empty array"], bytes: 0 };
  }
  if (files.length > MAX_PROJECT_FILES) {
    errors.push("projectFiles may contain at most " + MAX_PROJECT_FILES + " files");
  }

  let bytes = 0;
  const paths = new Set();
  for (const [index, file] of files.entries()) {
    if (!file || typeof file !== "object") {
      errors.push("projectFiles[" + index + "] must be an object");
      continue;
    }
    if (!isSafeRelativePath(file.path)) {
      errors.push("projectFiles[" + index + "].path must be a safe relative path");
    } else if (paths.has(file.path)) {
      errors.push("projectFiles contains duplicate path: " + file.path);
    } else {
      paths.add(file.path);
    }

    const hasText = typeof file.content === "string";
    const hasBinary = typeof file.contentBase64 === "string";
    if (hasText === hasBinary) {
      errors.push("projectFiles[" + index + "] must contain exactly one of content or contentBase64");
    }
    if (hasBinary && !/^[A-Za-z0-9+/]*={0,2}$/.test(file.contentBase64)) {
      errors.push("projectFiles[" + index + "].contentBase64 is invalid");
    }

    bytes += fileBytes(file);
  }

  if (!paths.has("index.html")) {
    errors.push("projectFiles must include index.html");
  }
  if (bytes > MAX_PROJECT_BYTES) {
    errors.push("projectFiles exceed the 24 MB project limit");
  }

  return { ok: errors.length === 0, errors, bytes };
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
