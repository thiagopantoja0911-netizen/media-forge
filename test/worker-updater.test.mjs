import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("silent updater preserves connection secrets and validates continuous worker heartbeats",async()=>{
  const script=await readFile(new URL("../desktop/update-worker.ps1",import.meta.url),"utf8");
  const launcher=await readFile(new URL("../desktop/launch-update-worker.vbs",import.meta.url),"utf8");
  assert.match(script,/\.env\.local/);
  assert.match(script,/\.worker-token\.dpapi/);
  assert.match(script,/Invoke-Git @\("fetch","origin",\$Branch\)/);
  assert.match(script,/checkout.*origin/);
  assert.match(script,/Invoke-Npm @\("install"/);
  assert.match(script,/desktop\\worker/);
  assert.match(script,/MediaForge Worker - Staging/);
  assert.match(script,/stableCount -ge 21/);
  assert.match(script,/worker-session-utf8\.log/);
  assert.match(launcher,/shell\.Run command,\s*0,\s*False/i);
  assert.doesNotMatch(launcher,/cmd\.exe/i);
});
