'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('advanced diagnostics collects process and scheduler info without exposing credentials',()=>{
  const script=fs.readFileSync(path.join(root,'scripts','inspect-worker.ps1'),'utf8');
  assert.match(script,/Get-ScheduledTaskInfo/);
  assert.match(script,/ParentProcessId/);
  assert.match(script,/LastWriteTime/);
  assert.match(script,/CredentialPresent/);
  assert.doesNotMatch(script,/ConvertTo-SecureString|PtrToStringBSTR/);
});
test('restart limits termination to remote worker from the exact V2 runner',()=>{
 const script=fs.readFileSync(path.join(root,'scripts','restart-worker-safe.ps1'),'utf8');
 assert.match(script,/IndexOf\(\$runner/);
 assert.match(script,/ParentProcessId/);
 assert.match(script,/Stop-Process -Id \(\[int\]\$child.ProcessId\)/);
 assert.doesNotMatch(script,/Stop-Process.*\$processes/);
 assert.doesNotMatch(script,/Unregister-ScheduledTask|Register-ScheduledTask/);
 assert.match(script,/WorkerCount -gt 0/);
});
