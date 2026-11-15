import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

function asExecutable(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.replace(/^"(.*)"$/, "$1");
  }
  if (value && typeof value === "object") {
    if (typeof value.path === "string") return asExecutable(value.path);
    if (value.default !== undefined) return asExecutable(value.default);
  }
  return null;
}

export function resolveExecutable(candidates, probeArgs = ["-version"]) {
  const seen = new Set();
  for (const raw of candidates) {
    const candidate = asExecutable(raw);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const result = spawnSync(candidate, probeArgs, {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore"]
      });
      if (!result.error && result.status === 0) return candidate;
    } catch {
      // Continue to the next candidate; unavailable bundled tools must not block PATH fallback.
    }
  }
  return null;
}

function select(candidates, probeArgs) {
  for (const [candidate, source, configuredPath] of candidates) {
    const executable = asExecutable(candidate);
    const normalized = configuredPath && executable
      ? (isAbsolute(executable) ? executable : resolve(executable))
      : executable;
    const path = resolveExecutable([normalized], probeArgs);
    if (path) return { path, source };
  }
  return { path: null, source: null };
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
    ffprobeSource: ffprobe.source
  };
}
