import test from "node:test";
import assert from "node:assert/strict";
import { access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFrameLabMediaBinaries } from "../media-binaries.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extension = process.platform === "win32" ? ".exe" : "";
const ffmpeg = join(root, "bin", "ffmpeg" + extension);
const ffprobe = join(root, "bin", "ffprobe" + extension);

test("build packages executable FFmpeg and FFprobe inside the Frame Lab runtime", async () => {
  await access(ffmpeg);
  await access(ffprobe);
  assert.equal((await stat(ffmpeg)).isFile(), true);
  assert.equal((await stat(ffprobe)).isFile(), true);
  const result = resolveFrameLabMediaBinaries({
    ffmpegStatic: null,
    ffprobeStatic: null,
    env: {
      FRAME_LAB_FFMPEG_PATH: "",
      FFMPEG_PATH: "",
      FRAME_LAB_FFPROBE_PATH: "",
      FFPROBE_PATH: ""
    }
  });
  assert.equal(result.ffmpegSource, "frame-lab/bin");
  assert.equal(result.ffprobeSource, "frame-lab/bin");
  assert.equal(result.ffmpegPath, ffmpeg);
  assert.equal(result.ffprobePath, ffprobe);
});
