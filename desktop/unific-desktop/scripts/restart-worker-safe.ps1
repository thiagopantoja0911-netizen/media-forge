param([Parameter(Mandatory=$true)][string]$InstallDir)
$ErrorActionPreference='Stop'
$InstallDir=[IO.Path]::GetFullPath($InstallDir)
$runner=Join-Path $InstallDir 'desktop\run-worker.ps1'
if(-not(Test-Path -LiteralPath $runner -PathType Leaf)){throw 'Worker não instalado.'}
$taskName='MediaForge Worker - Staging'
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$processes=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$parents=@($processes | Where-Object {
  $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -and
  $_.CommandLine.IndexOf($runner,[StringComparison]::OrdinalIgnoreCase) -ge 0
})
$parentIds=@($parents | ForEach-Object {[int]$_.ProcessId})
$children=@($processes | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match 'remote-worker-client\.mjs' -and
  $parentIds -contains [int]$_.ParentProcessId
})
# Only stop the worker belonging to the exact V2 run-worker.ps1 process tree.
# Never stop all node.exe instances: the computer may host unrelated services.
if($task -and $task.State -eq 'Running'){
  try{Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop}
  catch{throw 'O Windows bloqueou a interrupção da tarefa existente. Nenhum processo foi finalizado.'}
}
foreach($child in $children){Stop-Process -Id ([int]$child.ProcessId) -ErrorAction Stop}
foreach($parent in $parents){
  $still=Get-Process -Id ([int]$parent.ProcessId) -ErrorAction SilentlyContinue
  if($still){Stop-Process -Id ([int]$parent.ProcessId) -ErrorAction Stop}
}
Start-Sleep -Seconds 2
if($task){
  try{Start-ScheduledTask -TaskName $taskName -ErrorAction Stop}
  catch{throw 'Não foi possível iniciar a tarefa existente. Verifique as permissões do Windows.'}
}else{
  $envFile=Join-Path $InstallDir '.env.local'
  $dpapi=Join-Path $InstallDir '.mediaforge\worker-token.dpapi'
  if(-not(Test-Path -LiteralPath $envFile)){throw 'Arquivo de configuração ausente.'}
  if(-not(Test-Path -LiteralPath $dpapi)){throw 'Token protegido ausente. Conecte o MediaForge nas Configurações.'}
  $cmd=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $arguments='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$runner+'" -InstallDir "'+$InstallDir+'"'
  Start-Process -FilePath $cmd -ArgumentList $arguments -WindowStyle Hidden -WorkingDirectory $InstallDir -ErrorAction Stop | Out-Null
}
Start-Sleep -Seconds 5
$diagnostic=& (Join-Path $PSScriptRoot 'inspect-worker.ps1') -InstallDir $InstallDir | ConvertFrom-Json
if($diagnostic.WorkerCount -gt 0){
  Write-Output ('WORKER_STARTED PID=' + (($diagnostic.WorkerPids -join ',')) + '. Verifique o heartbeat no dashboard.')
  exit 0
}
if($diagnostic.OtherWorkerCount -gt 0){
  throw ('O reinício acionou a tarefa, mas não detectei novo processo da instalação V2. Há ' + $diagnostic.OtherWorkerCount + ' processo(s) de worker fora da árvore V2, que foram preservados. Último resultado da tarefa: ' + $diagnostic.LastTaskResult + '.')
}
throw ('O worker não permaneceu em execução. Estado da tarefa: ' + $diagnostic.TaskState + '. Último resultado: ' + $diagnostic.LastTaskResult + '. Verifique Diagnóstico avançado.')
