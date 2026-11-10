import test from "node:test";
import assert from "node:assert/strict";
import { validateJob, validateProjectFiles } from "../src/job-schema.mjs";

test("accepts a valid MediaForge job", () => {
  const result = validateJob({
    prompt: "Crie um vídeo curto com tipografia cinética.",
    project: {
      title: "Teste",
      durationSeconds: 15,
      aspectRatio: "9:16",
      outputs: ["video"],
      renderer: "hyperframes"
    }
  });
  assert.equal(result.ok, true);
});

test("accepts inline text and binary project files", () => {
  const result = validateProjectFiles([
    { path: "index.html", content: "<!doctype html>" },
    { path: "assets/logo.png", contentBase64: "aGVsbG8=" }
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.bytes, 20);
});

test("rejects unsafe, duplicated or incomplete project files", () => {
  const result = validateProjectFiles([
    { path: "../index.html", content: "bad" },
    { path: "index.html", content: "ok" },
    { path: "index.html", content: "duplicate" }
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /safe relative path/);
  assert.match(result.errors.join(" "), /duplicate/);
});
