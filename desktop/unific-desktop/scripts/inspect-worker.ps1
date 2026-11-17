param([Parameter(Mandatory=$true)][string]$InstallDir)
$ErrorActionPreference='Stop'
$InstallDir=[IO.Path]::GetFullPath($InstallDir)
$runner=Join-Path $InstallDir 'desktop\run-worker.ps1'
$log=Join-Path $InstallDir '.mediaforge\logs\worker-session.log'
$taskName='MediaForge Worker - Staging'
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$info=if($task){Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue}else{$null}
$processes=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$parents=@($processes | Where-Object {
  $_.Name -match '^(powershell|pwsh)\.exe$' -and
  $_.CommandLine -and
  $_.CommandLine.IndexOf($runner,[StringComparison]::OrdinalIgnoreCase) -ge 0
})
$parentIds=@($parents | ForEach-Object {[int]$_.ProcessId})
$nodeWorkers=@($processes | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match 'remote-worker-client\.mjs'
})
$ownedWorkers=@($nodeWorkers | Where-Object {$parentIds -contains [int]$_.ParentProcessId})
$logTime=$null
$tail=@()
if(Test-Path -LiteralPath $log -PathType Leaf){
  $logTime=(Get-Item -LiteralPath $log).LastWriteTime.ToString('o')
  $tail=@(Get-Content -LiteralPath $log -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object {
    ($_ -replace '(?i)Bearer\s+[A-Za-z0-9_\-\.]+','Bearer [REDACTED]' -replace '(?i)(token|password|secret)\s*[=:]\s*\S+','$1=[REDACTED]')
  })
}
[ordered]@{
  Installed=(Test-Path -LiteralPath $runner -PathType Leaf)
  TaskState=if($task){[string]$task.State}else{'Missing'}
  LastTaskResult=if($info){[int]$info.LastTaskResult}else{$null}
  LastRunTime=if($info){$info.LastRunTime.ToString('o')}else{$null}
  WorkerCount=$ownedWorkers.Count
  WorkerPids=@($ownedWorkers | ForEach-Object {[int]$_.ProcessId})
  OtherWorkerCount=($nodeWorkers.Count-$ownedWorkers.Count)
  CredentialPresent=(Test-Path -LiteralPath (Join-Path $InstallDir '.mediaforge\worker-token.dpapi'))
  LogModifiedAt=$logTime
  LogTail=$tail
} | ConvertTo-Json -Compress -Depth 4
