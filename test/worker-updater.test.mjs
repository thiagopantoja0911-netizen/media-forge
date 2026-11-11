import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("silent updater works without a local Git clone and preserves MediaForge connection data",async()=>{
  const script=await readFile(new URL("../desktop/update-worker.ps1",import.meta.url),"utf8");
  const launcher=await readFile(new URL("../desktop/launch-update-worker.vbs",import.meta.url),"utf8");
  assert.ok(script.includes("api.github.com/repos/thiagopantoja0911-netizen/media-forge/commits"));
  assert.ok(script.includes("https://codeload.github.com/thiagopantoja0911-netizen/media-forge/zip/"));
  assert.ok(script.includes("Expand-Archive"));
  assert.ok(script.includes("robocopy"));
  assert.ok(script.includes(".env.local"));
  assert.ok(script.includes(".worker-token.dpapi"));
  assert.ok(script.includes('"/XD",".git","node_modules",".mediaforge"'));
  assert.ok(script.includes('"/XF",".env",".env.*"'));
  assert.ok(script.includes("stableCount -ge 21"));
  assert.ok(script.includes("worker-session-utf8.log"));
  assert.equal(script.includes("git fetch"),false);
  assert.equal(script.includes("git checkout"),false);
  assert.equal(script.includes("git reset"),false);
  assert.ok(launcher.includes("shell.Run command, 0, False"));
  assert.equal(launcher.includes("cmd.exe"),false);
});
