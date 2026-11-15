import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const content=readFileSync(new URL("../desktop/prepare-worker-migration.ps1",import.meta.url),"utf8");
test("prepare Windows V2 without touching original scheduled task or processes",()=>{
  assert.match(content,/Test-Path -LiteralPath \(Join-Path \$CurrentDir "\.git"\)/);
  assert.match(content,/Destino já existe/);
  assert.match(content,/ExpectedCommit/);
  assert.match(content,/git clone --quiet --single-branch/);
  assert.match(content,/uploadDeliveredArtifact/);
  assert.match(content,/Copy-Item -LiteralPath \$oldEnv/);
  assert.match(content,/icacls \$newEnv/);
  assert.match(content,/worker-token\.dpapi/);
  assert.match(content,/VerifyAuthentication/);
  assert.match(content,/auth-check/);
  assert.doesNotMatch(content,/\b(?:Stop-Process|Stop-ScheduledTask|Unregister-ScheduledTask|Register-ScheduledTask|Remove-Item|git reset)\b/i);
});
