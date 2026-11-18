import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProjectFiles } from "../src/project-files.mjs";
import { validateProjectFiles } from "../src/job-schema.mjs";

test("preserves native contentBase64 fields while normalizing inline project files", () => {
  const files = normalizeProjectFiles([
    { path: "index.html", content: "<!doctype html>" },
    { path: "assets/background.mp4", contentBase64: "AAECAw==" },
    { path: "assets/badge.png", contentBase64: "aGVsbG8=" },
    { path: "assets/gsap.min.js", content: "window.gsap = true;" }
  ]);
  assert.deepEqual(files[1], { path: "assets/background.mp4", contentBase64: "AAECAw==" });
  assert.deepEqual(files[2], { path: "assets/badge.png", contentBase64: "aGVsbG8=" });
  assert.equal(validateProjectFiles(files).ok, true);
});

test("continues accepting legacy encoding=base64 transport", () => {
  const files = normalizeProjectFiles([
    { path: "index.html", content: "<!doctype html>" },
    { path: "assets/legacy.bin", encoding: "base64", content: "AAECAw==" }
  ]);
  assert.deepEqual(files[1], { path: "assets/legacy.bin", contentBase64: "AAECAw==" });
  assert.equal(validateProjectFiles(files).ok, true);
});

test("does not silently discard ambiguous text and binary content", () => {
  const files = normalizeProjectFiles([
    { path: "index.html", content: "<!doctype html>" },
    { path: "assets/ambiguous.bin", content: "text", contentBase64: "AAECAw==" }
  ]);
  assert.equal(validateProjectFiles(files).ok, false);
  assert.match(validateProjectFiles(files).errors.join(" "), /exactly one of content or contentBase64/);
});
