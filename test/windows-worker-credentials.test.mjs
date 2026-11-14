import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=x=>readFileSync(new URL("../desktop/"+x,import.meta.url),"utf8");
test("new worker credentials are DPAPI-protected, not plain text in env config",()=>{
 const connect=file("connect-remote.ps1");
 assert.match(connect,/ConvertFrom-SecureString/);
 assert.match(connect,/worker-token\.dpapi/);
 assert.match(connect,/v1\/worker\/auth-check/);
 assert.match(connect,/TOKEN_PREFLIGHT_FAILED/);
 assert.match(connect,/MEDIAFORGE_WORKER_TOKEN/);
 assert.doesNotMatch(connect,/MEDIAFORGE_WORKER_TOKEN=\$token/);
 assert.match(connect,/icacls/);
 assert.match(connect,/installed=\$false/);
});
test("runner decrypts same-user DPAPI before starting Node and never logs token",()=>{
 const run=file("run-worker.ps1");
 assert.match(run,/ConvertTo-SecureString/);
 assert.match(run,/SecureStringToBSTR/);
 assert.match(run,/ZeroFreeBSTR/);
 assert.match(run,/worker-token\.dpapi/);
 assert.doesNotMatch(run,/Write-Host\s+\$env:MEDIAFORGE_WORKER_TOKEN/);
});
test("battery-capable Windows task starts on login and survives battery transitions",()=>{
 const launcher=file("start-worker-background.ps1");
 assert.match(launcher,/AllowStartIfOnBatteries/);
 assert.match(launcher,/DontStopIfGoingOnBatteries/);
 assert.match(launcher,/New-ScheduledTaskTrigger -AtLogOn/);
 assert.match(launcher,/LogonType Interactive/);
});
test("installer refuses non-git populated directory and never rewrites existing .env",()=>{
 const install=file("install-worker.ps1");
 assert.match(install,/Diretório existente sem Git/);
 assert.match(install,/if \(-not \(Test-Path -LiteralPath "\.env.local"\)\)/);
 assert.match(install,/feature\/frame-lab-chat-mcp-20261113/);
 assert.match(file("update-worker-safe.ps1"),/feature\/frame-lab-chat-mcp-20261113/);
});
