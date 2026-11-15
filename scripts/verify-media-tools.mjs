import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "@derhuerst/ffprobe-static";
import { resolveFrameLabMediaBinaries } from "../frame-lab/media-binaries.mjs";

const binaries = resolveFrameLabMediaBinaries({ ffmpegStatic, ffprobeStatic });
if (!binaries.ffmpegPath || !binaries.ffprobePath) {
  console.error("Media tool installation incomplete:", JSON.stringify({
    ffmpeg: Boolean(binaries.ffmpegPath),
    ffprobe: Boolean(binaries.ffprobePath),
    ffmpegSource: binaries.ffmpegSource,
    ffprobeSource: binaries.ffprobeSource
  }));
  process.exit(1);
}

console.log("Media tools ready:", JSON.stringify({
  ffmpeg: binaries.ffmpegSource,
  ffprobe: binaries.ffprobeSource
}));
