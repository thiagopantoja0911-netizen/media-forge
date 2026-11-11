import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("silent updater works without a local Git clone and preserves MediaForge connection data",async()=>{
  const script=await readFile(new URL("../desktop/update-worker.ps1",import.meta.url),"utf8");
  const launcher=await readFile(new URL("../desktop/launch-update-worker.vbs",import.meta.url),"utf8");
  assert.match(script,/api\.github\.com\/repos\/thiagopantoja0911-netizen\/media-forge\/commits/);
  assert.match(script,/codeload\.githubusercontent\.com|codeload\.github\.com/);
  assert.match(script,/Expand-Archive/);
  assert.match(script,/robocopy/);
  assert.match(script,/\.env\.local/);
  assert.match(script,/\.worker-token\.dpapi/);
  assert.match(script,/"/XD","\.git","node_modules","\.mediaforge"/);
  assert.match(script,/"/XF","\.env","\.env\.\*"/);
  assert.match(script,/stableCount -ge 21/);
  assert.match(script,/worker-session-utf8\.log/);
  assert.doesNotMatch(script,/Test-Path[^\r\n]*\.git/);
  assert.doesNotMatch(script,/git fetch|git checkout|git reset/i);
  assert.match(launcher,/shell\.Run command,\s*0,\s*False/i);
  assert.doesNotMatch(launcher,/cmd\.exe/i);
});
