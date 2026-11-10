import { access, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";

const projectsRoot = resolve(process.env.MEDIAFORGE_PROJECTS_DIR ?? ".mediaforge/projects");
const outputRoot = resolve(process.env.MEDIAFORGE_OUTPUT_DIR ?? ".mediaforge/outputs");

function insideRoot(root, candidate) {
  const path = resolve(candidate);
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + requireSeparator()));
}

function requireSeparator() {
  return process.platform === "win32" ? "\\" : "/";
}

function commandForPlatform() {
  if (process.env.HYPERFRAMES_BIN) return process.env.HYPERFRAMES_BIN;
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, CI: "1" }
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) return resolvePromise({ stdout, stderr });
      const error = new Error(
        "HyperFrames exited with " + (signal ? "signal " + signal : "code " + code)
        + (stderr.trim() ? ": " + stderr.trim().slice(-2000) : "")
      );
      error.code = "HYPERFRAMES_FAILED";
      error.exitCode = code;
      reject(error);
    });
  });
}

function cliArgs(command, action, ...args) {
  if (command.toLowerCase().endsWith("hyperframes") || command.toLowerCase().endsWith("hyperframes.cmd")) {
    return [action, ...args];
  }
  return ["hyperframes", action, ...args];
}

export async function renderWithHyperFrames(job) {
  const sourceDir = job.project.sourceDir;
  if (!sourceDir || isAbsolute(sourceDir) || sourceDir.split(/[\\/]/).includes("..")) {
    const error = new Error("project.sourceDir is required and must be relative to MEDIAFORGE_PROJECTS_DIR");
    error.code = "INVALID_PROJECT_DIR";
    throw error;
  }

  const projectDir = resolve(projectsRoot, sourceDir);
  if (!insideRoot(projectsRoot, projectDir)) {
    const error = new Error("project.sourceDir escapes MEDIAFORGE_PROJECTS_DIR");
    error.code = "INVALID_PROJECT_DIR";
    throw error;
  }

  await access(join(projectDir, "index.html"));
  await mkdir(outputRoot, { recursive: true });

  const outputName = job.project.outputName ?? job.id + ".mp4";
  if (!outputName || isAbsolute(outputName) || outputName.includes("/") || outputName.includes("\\") || outputName.includes("..")) {
    const error = new Error("project.outputName must be a safe filename");
    error.code = "INVALID_OUTPUT_NAME";
    throw error;
  }

  const outputPath = join(outputRoot, outputName);
  const command = commandForPlatform();

  const lint = await run(command, cliArgs(command, "lint", projectDir, "--json"), projectDir);
  const render = await run(command, cliArgs(command, "render", "-o", outputPath), projectDir);

  return {
    mode: "hyperframes-cli",
    outputPath,
    lint: lint.stdout.trim() || null,
    renderLog: render.stdout.trim() || null
  };
}
