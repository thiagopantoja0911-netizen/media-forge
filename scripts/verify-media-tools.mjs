import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "@derhuerst/ffprobe-static";
import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFrameLabMediaBinaries } from "../frame-lab/media-binaries.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const binDir = join(root, "frame-lab", "bin");
await rm(binDir, { recursive: true, force: true });

const binaries = resolveFrameLabMediaBinaries({ ffmpegStatic, ffprobeStatic });
if (!binaries.ffmpegPath || !binaries.ffprobePath) {
  console.error("Media tool installation incomplete:", JSON.stringify({
    ffmpeg: Boolean(binaries.ffmpegPath),
    ffprobe: Boolean(binaries.ffprobePath),
    ffmpegSource: binaries.ffmpegSource,
    ffprobeSource: binaries.ffprobeSource,
    diagnostics: binaries.diagnostics
  }));
  process.exit(1);
}
const extension = process.platform === "win32" ? ".exe" : "";
const ffmpegTarget = join(binDir, "ffmpeg" + extension);
const ffprobeTarget = join(binDir, "ffprobe" + extension);

await mkdir(binDir, { recursive: true });
await copyFile(binaries.ffmpegPath, ffmpegTarget);
await copyFile(binaries.ffprobePath, ffprobeTarget);
if (process.platform !== "win32") {
  await chmod(ffmpegTarget, 0o755);
  await chmod(ffprobeTarget, 0o755);
}

const emptyEnv = {
  FRAME_LAB_FFMPEG_PATH: "",
  FFMPEG_PATH: "",
  FRAME_LAB_FFPROBE_PATH: "",
  FFPROBE_PATH: ""
};
const packaged = resolveFrameLabMediaBinaries({
  ffmpegStatic: null,
  ffprobeStatic: null,
  env: emptyEnv
});
if (packaged.ffmpegSource !== "frame-lab/bin" || packaged.ffprobeSource !== "frame-lab/bin") {
  console.error("Packaged Frame Lab media tools are not executable:", JSON.stringify({
    ffmpeg: packaged.ffmpegSource,
    ffprobe: packaged.ffprobeSource,
    diagnostics: packaged.diagnostics
  }));
  process.exit(1);
}

console.log("Media tools ready:", JSON.stringify({
  ffmpeg: packaged.ffmpegSource,
  ffprobe: packaged.ffprobeSource,
  packagedForRuntime: true
}));
