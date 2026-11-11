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

function run(command, args, cwd) {
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

function renderArgs(job, outputPath) {
  const args = ["render", "-o", outputPath];
  addOption(args, "resolution", job.project.resolution);
  addOption(args, "fps", job.project.fps);
  addOption(args, "quality", job.project.quality);
  addOption(args, "workers", job.project.workers);
  if (job.project.browserGpu === false) args.push("--no-browser-gpu");
  if (job.project.browserGpu === true) args.push("--browser-gpu");
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
  await mkdir(outputRoot, { recursive: true });

  const outputName = job.project.outputName ?? job.id + ".mp4";
  if (!outputName || isAbsolute(outputName) || outputName.includes("/") || outputName.includes("\\") || outputName.includes("..")) {
    const error = new Error("project.outputName must be a safe filename");
    error.code = "INVALID_OUTPUT_NAME";
    throw error;
  }

  const outputPath = join(outputRoot, outputName);
  const command = commandForPlatform();

  let preflight = null;
  if (job.project.preflight !== false) {
    await onProgress(24, "Executando auditoria completa HyperFrames, incluindo craft pass");
    preflight = await run(command, cliArgs(command, "check", projectDir, "--json"), projectDir);
    await onProgress(36, "Auditoria completa HyperFrames aprovada");
  }
  await onProgress(40, "Renderizando com o perfil solicitado, sem redução de qualidade");
  const render = await run(command, cliArgs(command, ...renderArgs(job, outputPath)), projectDir);
  await onProgress(92, "Render concluído; iniciando verificação do arquivo final");

  return {
    mode: "hyperframes-cli",
    outputPath,
    preflight: preflight?.stdout.trim() || null,
    renderLog: render.stdout.trim() || null
  };
}
