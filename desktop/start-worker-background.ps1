param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging"
)
$ErrorActionPreference = "Stop"
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$runner = Join-Path $InstallDir "desktop\run-worker.ps1"
if (-not (Test-Path -LiteralPath $runner)) { throw "Worker não encontrado: $runner" }
$taskName = "MediaForge Worker - Staging"
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '" -InstallDir "' + $InstallDir + '"'
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$settings.Hidden = $true
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.State -eq "Running") { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Worker MediaForge em segundo plano. Não altera o Salevo antigo." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2
$state = (Get-ScheduledTask -TaskName $taskName).State
if ($state -ne "Running" -and $state -ne "Queued") { throw "A tarefa do Worker não iniciou. Estado: $state" }
Write-Output "Worker MediaForge instalado como tarefa oculta de segundo plano."
Write-Output "Tarefa: $taskName | Usuário: $userId | Estado: $state"
