import { access, mkdir, writeFile } from "node:fs/promises";
import { inspectMotionProject } from "../motion/preflight.mjs";
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
  const configured = process.env.HYPERFRAMES_BIN;
  if (configured) {
    if (process.platform === "win32" && configured.toLowerCase() === "npx") return "npx.cmd";
    return configured;
  }
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (text.length > 0 && !/[\s"&|<>^]/.test(text)) return text;
  return '"' + text.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1") + '"';
}

export function summarizeCheck(stdout) {
  try {
    const report = JSON.parse(stdout);
    const findings = [];
    function visit(value) {
      if (!value || typeof value !== "object") return;
      if (value.severity === "error" && value.message) findings.push([value.code, value.selector, value.message].filter(Boolean).join(": "));
      for (const entry of Object.values(value)) if (typeof entry === "object") visit(entry);
    }
    visit(report);
    return [...new Set(findings)].slice(0, 8).join("; ");
  } catch { return ""; }
}

function run(command, args, cwd, diagnosticBase) {
  return new Promise((resolvePromise, reject) => {
    const isWindowsCmd = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
    const spawnCommand = isWindowsCmd ? (process.env.ComSpec ?? "cmd.exe") : command;
    const spawnArgs = isWindowsCmd
      ? ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")]
      : args;
    const child = spawn(spawnCommand, spawnArgs, {
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
    child.on("close", async (code, signal) => {
      try {
      // Preserve the complete reports, including stdout JSON, not just the stderr tail.
      await writeFile(diagnosticBase + ".stdout.log", stdout);
      await writeFile(diagnosticBase + ".stderr.log", stderr);
      if (code === 0) return resolvePromise({ stdout, stderr });
      const summary = summarizeCheck(stdout);
      const error = new Error(
        "HyperFrames exited with " + (signal ? "signal " + signal : "code " + code)
        + (summary ? ": " + summary : stderr.trim() ? ": " + stderr.trim().slice(-2000) : "")
        + ". Full diagnostics: " + diagnosticBase
      );
      error.code = "HYPERFRAMES_FAILED";
      error.exitCode = code;
      error.diagnostics = { stdout: diagnosticBase + ".stdout.log", stderr: diagnosticBase + ".stderr.log" };
      reject(error);
      } catch (error) { reject(error); }
    });
  });
}

function cliArgs(command, action, ...args) {
  const lower = command.toLowerCase();
  const isNpx = /(?:^|[\\/])npx(?:\.cmd)?$/.test(lower);
  if (isNpx) {
    const version = process.env.HYPERFRAMES_VERSION?.trim();
    const packageSpec = version ? "hyperframes@" + version : "hyperframes";
    return ["--yes", packageSpec, action, ...args];
  }
  if (lower.endsWith("hyperframes") || lower.endsWith("hyperframes.cmd")) {
    return [action, ...args];
  }
  return ["hyperframes", action, ...args];
}

function addOption(args, name, value) {
  if (value === undefined || value === null || value === "") return;
  args.push("--" + name, String(value));
}

export function renderArgs(job, outputPath) {
  const args = ["render", "-o", outputPath];
  addOption(args, "resolution", job.project.resolution);
  addOption(args, "fps", job.project.fps);
  addOption(args, "quality", job.project.quality);
  addOption(args, "workers", job.project.workers);
  if (job.project.browserGpu === false) args.push("--no-browser-gpu");
  if (job.project.browserGpu === true) args.push("--browser-gpu");
  // Keep compatibility with the validated cinematic fork installed on the worker.
  if (job.metadata?.kind === "cinematic-3d" && job.metadata?.motionBlur?.enabled === true) {
    if (!process.env.HYPERFRAMES_BIN?.toLowerCase().endsWith("hyperframes.cmd")) {
      throw new Error("The cinematic 3D renderer requires the validated local HyperFrames fork");
    }
    args.push("--cinematic-motion-blur");
  }
  return args;
}

export async function renderWithHyperFrames(job, { onProgress = async () => {} } = {}) {
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
  const motionReview = await inspectMotionProject(projectDir, job.project);
  await mkdir(outputRoot, { recursive: true });
  const diagnosticsDir = join(projectDir, ".mediaforge-diagnostics");
  await mkdir(diagnosticsDir, { recursive: true });

  const outputName = job.project.outputName ?? job.id + ".mp4";
  if (!outputName || isAbsolute(outputName) || outputName.includes("/") || outputName.includes("\\") || outputName.includes("..")) {
    const error = new Error("project.outputName must be a safe filename");
    error.code = "INVALID_OUTPUT_NAME";
    throw error;
  }

  const outputPath = join(outputRoot, outputName);
  const command = commandForPlatform();

  let preflight = null;
  if (job.project.preflight !== false || motionReview) {
    try {
      await onProgress(24, "Executando auditoria completa HyperFrames, incluindo craft pass");
      preflight = await run(command, cliArgs(command, "check", projectDir, "--json"), projectDir, join(diagnosticsDir, "check"));
      await onProgress(36, "Auditoria HyperFrames aprovada");
    } catch (error) {
      error.code = "HYPERFRAMES_PREFLIGHT_FAILED";
      error.retryable = false;
      throw error;
    }
  }
  await onProgress(40, "Renderizando vídeo com HyperFrames");
  const render = await run(command, cliArgs(command, ...renderArgs(job, outputPath)), projectDir, join(diagnosticsDir, "render"));
  await onProgress(92, "Render concluído; verificando o MP4");

  return {
    mode: "hyperframes-cli",
    outputPath,
    motionReview,
    diagnosticsDir,
    preflight: preflight?.stdout.trim() || null,
    renderLog: render.stdout.trim() || null
  };
}
