import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

function asExecutable(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.replace(/^"(.*)"$/, "$1") : null;
  }
  if (value && typeof value === "object") {
    if (typeof value.path === "string") return asExecutable(value.path);
    if (value.default !== undefined) return asExecutable(value.default);
  }
  return null;
}

function probe(candidate, source, configuredPath, probeArgs) {
  const executable = asExecutable(candidate);
  if (!executable) {
    return {
      path: null,
      source: null,
      diagnostic: {
        source,
        configured: false,
        available: false,
        reason: candidate == null ? "not-configured-or-package-path-unavailable" : "invalid-candidate"
      }
    };
  }
  const normalized = configuredPath
    ? (isAbsolute(executable) ? executable : resolve(executable))
    : executable;
  try {
    const result = spawnSync(normalized, probeArgs, {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"]
    });
    if (result.error) {
      return {
        path: null, source: null,
        diagnostic: { source, configured: true, available: false, reason: result.error.code || "spawn-error" }
      };
    }
    if (result.status !== 0) {
      return {
        path: null, source: null,
        diagnostic: {
          source, configured: true, available: false,
          reason: "non-zero-exit", exitCode: Number.isInteger(result.status) ? result.status : null,
          signal: result.signal || null
        }
      };
    }
    return {
      path: normalized, source,
      diagnostic: { source, configured: true, available: true, reason: null }
    };
  } catch (error) {
    return {
      path: null, source: null,
      diagnostic: { source, configured: true, available: false, reason: error?.code || "spawn-error" }
    };
  }
}

function select(candidates, probeArgs) {
  const diagnostics = [];
  for (const [candidate, source, configuredPath] of candidates) {
    const result = probe(candidate, source, configuredPath, probeArgs);
    diagnostics.push(result.diagnostic);
    if (result.path) return { path: result.path, source: result.source, diagnostics };
  }
  return { path: null, source: null, diagnostics };
}

export function resolveExecutable(candidates, probeArgs = ["-version"]) {
  for (const raw of candidates) {
    const result = probe(raw, "candidate", false, probeArgs);
    if (result.path) return result.path;
  }
  return null;
}

export function resolveFrameLabMediaBinaries({
  ffmpegStatic,
  ffprobeStatic,
  env = process.env,
  probeArgs = ["-version"]
} = {}) {
  const ffmpeg = select([
    [env.FRAME_LAB_FFMPEG_PATH, "FRAME_LAB_FFMPEG_PATH", true],
    [env.FFMPEG_PATH, "FFMPEG_PATH", true],
    [ffmpegStatic, "ffmpeg-static", true],
    ["ffmpeg", "PATH", false]
  ], probeArgs);
  const ffprobe = select([
    [env.FRAME_LAB_FFPROBE_PATH, "FRAME_LAB_FFPROBE_PATH", true],
    [env.FFPROBE_PATH, "FFPROBE_PATH", true],
    [ffprobeStatic, "@derhuerst/ffprobe-static", true],
    ["ffprobe", "PATH", false]
  ], probeArgs);
  return {
    ffmpegPath: ffmpeg.path,
    ffmpegSource: ffmpeg.source,
    ffprobePath: ffprobe.path,
    ffprobeSource: ffprobe.source,
    diagnostics: {
      ffmpeg: ffmpeg.diagnostics,
      ffprobe: ffprobe.diagnostics
    }
  };
}
