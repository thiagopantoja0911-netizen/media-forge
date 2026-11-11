import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Windows worker pins local FFmpeg and FFprobe outside the Hostinger runtime",async()=>{
  const pkg=JSON.parse(await readFile(new URL("../desktop/worker/package.json",import.meta.url),"utf8"));
  assert.equal(pkg.dependencies["ffmpeg-static"],"5.3.0");
  assert.equal(pkg.dependencies["@derhuerst/ffprobe-static"],"5.3.0");
  const runner=await readFile(new URL("../desktop/run-worker.ps1",import.meta.url),"utf8");
  assert.match(runner,/npm install --prefix \$workerDeps/);
  assert.match(runner,/ffmpeg-static\\package\.json/);
  assert.match(runner,/ffprobe-static\\package\.json/);
});
