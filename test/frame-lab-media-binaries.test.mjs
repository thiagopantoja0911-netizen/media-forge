import test from "node:test";
import assert from "node:assert/strict";
import { relative, resolve, sep } from "node:path";
import { resolveExecutable, resolveFrameLabMediaBinaries } from "../frame-lab/media-binaries.mjs";

test("media binary resolver skips missing bundled paths and uses a working fallback", () => {
  const resolved = resolveExecutable(
    ["/definitely/missing/ffmpeg", process.execPath],
    ["--version"]
  );
  assert.equal(resolved, process.execPath);
});

test("media binary resolver reports unavailable tools without throwing", () => {
  const resolved = resolveExecutable(
    ["/definitely/missing/ffprobe"],
    ["--version"]
  );
  assert.equal(resolved, null);
});

test("Frame Lab honors explicit executable overrides and reports their source", () => {
  const resolved = resolveFrameLabMediaBinaries({
    ffmpegStatic: "/missing/bundled/ffmpeg",
    ffprobeStatic: { path: "/missing/bundled/ffprobe" },
    env: {
      FRAME_LAB_FFMPEG_PATH: process.execPath,
      FFMPEG_PATH: "",
      FRAME_LAB_FFPROBE_PATH: process.execPath,
      FFPROBE_PATH: ""
    },
    probeArgs: ["--version"]
  });

  assert.equal(resolved.ffmpegPath, process.execPath);
  assert.equal(resolved.ffmpegSource, "FRAME_LAB_FFMPEG_PATH");
  assert.equal(resolved.ffprobePath, process.execPath);
  assert.equal(resolved.ffprobeSource, "FRAME_LAB_FFPROBE_PATH");
  assert.equal(resolved.diagnostics.ffmpeg[0].available, false);
  assert.equal(resolved.diagnostics.ffprobe[0].available, false);
});

test("relative executable overrides are normalized before worker cwd changes", () => {
  const relativeExecutable = relative(process.cwd(), process.execPath);
  const relativeOverride = relativeExecutable.startsWith(".")
    ? relativeExecutable
    : "." + sep + relativeExecutable;
  const resolved = resolveFrameLabMediaBinaries({
    ffmpegStatic: "/missing/bundled/ffmpeg",
    ffprobeStatic: "/missing/bundled/ffprobe",
    env: {
      FRAME_LAB_FFMPEG_PATH: relativeOverride,
      FFMPEG_PATH: "",
      FRAME_LAB_FFPROBE_PATH: relativeOverride,
      FFPROBE_PATH: ""
    },
    probeArgs: ["--version"]
  });

  assert.equal(resolved.ffmpegPath, resolve(relativeOverride));
  assert.equal(resolved.ffprobePath, resolve(relativeOverride));
  assert.equal(resolved.ffmpegSource, "FRAME_LAB_FFMPEG_PATH");
  assert.equal(resolved.ffprobeSource, "FRAME_LAB_FFPROBE_PATH");
});

test("runtime diagnostics report failure codes without exposing executable paths", () => {
  const privatePath = "/private/runtime/secrets/ffmpeg";
  const resolved = resolveFrameLabMediaBinaries({
    ffmpegStatic: null,
    ffprobeStatic: null,
    env: {
      FRAME_LAB_FFMPEG_PATH: privatePath,
      FFMPEG_PATH: "",
      FRAME_LAB_FFPROBE_PATH: privatePath,
      FFPROBE_PATH: ""
    },
    probeArgs: ["-version"]
  });
  assert.equal(resolved.diagnostics.ffmpeg[0].source, "FRAME_LAB_FFMPEG_PATH");
  assert.equal(resolved.diagnostics.ffmpeg[0].reason, "ENOENT");
  assert.equal(resolved.diagnostics.ffprobe[0].source, "FRAME_LAB_FFPROBE_PATH");
  assert.equal(resolved.diagnostics.ffprobe[0].reason, "ENOENT");
  assert.equal(JSON.stringify(resolved).includes(privatePath), false);
});
