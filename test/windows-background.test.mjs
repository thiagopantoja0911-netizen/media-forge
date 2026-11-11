import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Windows worker is installed and launched as a hidden logon task", async () => {
  const task = await readFile(new URL("../desktop/start-worker-background.ps1", import.meta.url), "utf8");
  const runner = await readFile(new URL("../desktop/run-worker.ps1", import.meta.url), "utf8");
  const launcher = await readFile(new URL("../desktop/launch-installer.vbs", import.meta.url), "utf8");
  const connector = await readFile(new URL("../desktop/connect-remote.ps1", import.meta.url), "utf8");
  assert.match(task, /New-ScheduledTaskTrigger\s+-AtLogOn/i);
  assert.match(task, /New-ScheduledTaskPrincipal[\s\S]*?LogonType Interactive/i);
  assert.match(task, /WindowStyle Hidden/i);
  assert.match(task, /\$settings\.Hidden\s*=\s*\$true/i);
  assert.match(task, /Start-ScheduledTask/i);
  assert.match(task, /RestartCount 999/i);
  assert.match(runner, /worker-session-utf8\.log/i);
  assert.ok(runner.includes("ProtectedData]::Protect"));
  assert.ok(runner.includes("ProtectedData]::Unprotect"));
  assert.ok(runner.includes(".worker-token.dpapi"));
  assert.ok(connector.includes("ProtectedData]::Protect"));
  assert.ok(!connector.includes("MEDIAFORGE_WORKER_TOKEN=$token"));
  assert.match(runner, /remote-worker-client\.mjs/i);
  assert.match(runner, /while\s*\(\$true\)/i);
  assert.match(runner, /Start-Sleep -Seconds \$restartDelay/i);
  assert.match(runner, /Add-Content[\s\S]*?-Encoding UTF8/i);
  // Native stderr is a log line, not a terminating PowerShell exception.
  assert.match(runner, /\$previousPreference = \$ErrorActionPreference/);
  assert.match(runner, /\$ErrorActionPreference = "Continue"[\s\S]*?& node "[^"]*remote-worker-client\.mjs" 2>&1/);
  assert.match(runner, /\$ErrorActionPreference = \$previousPreference/);
  assert.match(runner, /\$exitCode = \$nativeExitCode/);
  assert.match(task, /RestartInterval \(New-TimeSpan -Minutes 1\)/i);
  assert.doesNotMatch(task, /RestartInterval \(New-TimeSpan -Seconds 15\)/i);
  assert.match(task, /Export-ScheduledTask[\s\S]*?existingXml/i);
  assert.match(task, /Register-ScheduledTask[\s\S]*?existingXml[\s\S]*?Start-ScheduledTask/i);
  assert.match(task, /Task Scheduler requires[\s\S]*?at least one minute/i);
  assert.doesNotMatch(runner, /WindowStyle Minimized/i);
  assert.match(launcher, /shell\.Run command,\s*0,\s*False/i);
  assert.doesNotMatch(launcher, /cmd\.exe/i);
});
