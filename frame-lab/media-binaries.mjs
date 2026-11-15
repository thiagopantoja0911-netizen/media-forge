import { spawnSync } from "node:child_process";

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
  for (const [candidate, source] of candidates) {
    const path = resolveExecutable([candidate], probeArgs);
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
    [env.FRAME_LAB_FFMPEG_PATH, "FRAME_LAB_FFMPEG_PATH"],
    [env.FFMPEG_PATH, "FFMPEG_PATH"],
    [ffmpegStatic, "ffmpeg-static"],
    ["ffmpeg", "PATH"]
  ], probeArgs);
  const ffprobe = select([
    [env.FRAME_LAB_FFPROBE_PATH, "FRAME_LAB_FFPROBE_PATH"],
    [env.FFPROBE_PATH, "FFPROBE_PATH"],
    [ffprobeStatic, "@derhuerst/ffprobe-static"],
    ["ffprobe", "PATH"]
  ], probeArgs);
  return {
    ffmpegPath: ffmpeg.path,
    ffmpegSource: ffmpeg.source,
    ffprobePath: ffprobe.path,
    ffprobeSource: ffprobe.source
  };
}
