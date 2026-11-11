import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractCreatorPackage } from "../src/creator-package.mjs";

test("extracts text and base64 files into a new directory", async () => {
  const parent = await mkdtemp(join(tmpdir(), "mediaforge-package-"));
  const output = join(parent, "project");
  const binary = Buffer.from("audio-binary");
  const bundle = {
    projectFiles: [
      { path: "index.html", content: "<html>ok</html>" },
      { path: "assets/audio/voice.wav", contentBase64: binary.toString("base64") }
    ],
    readiness: { renderReady: false }
  };
  try {
    const result = await extractCreatorPackage(bundle, output);
    assert.equal(result.fileCount, 2);
    assert.equal(result.renderReady, false);
    assert.equal(await readFile(join(output, "index.html"), "utf8"), "<html>ok</html>");
    assert.deepEqual(await readFile(join(output, "assets/audio/voice.wav")), binary);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("rejects unsafe paths and removes a partially extracted directory", async () => {
  const parent = await mkdtemp(join(tmpdir(), "mediaforge-package-"));
  const output = join(parent, "project");
  const bundle = {
    projectFiles: [
      { path: "index.html", content: "<html></html>" },
      { path: "../escape.txt", content: "no" }
    ]
  };
  try {
    await assert.rejects(() => extractCreatorPackage(bundle, output), /projectFiles/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("does not overwrite an existing destination directory", async () => {
  const parent = await mkdtemp(join(tmpdir(), "mediaforge-package-"));
  const output = join(parent, "existing");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(output);
  try {
    await assert.rejects(() => extractCreatorPackage({
      projectFiles: [{ path: "index.html", content: "x" }]
    }, output), /EEXIST/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
