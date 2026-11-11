param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging"
)
$ErrorActionPreference = "Stop"
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$runner = Join-Path $InstallDir "desktop\run-worker.ps1"
if (-not (Test-Path -LiteralPath $runner)) { throw "Worker não encontrado: $runner" }
$taskName = "MediaForge Worker - Staging"
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$launcher = Join-Path $InstallDir "desktop\launch-worker-hidden.vbs"
if (-not (Test-Path -LiteralPath $launcher)) { throw "Inicializador oculto do Worker não encontrado: $launcher" }
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
if (-not (Test-Path -LiteralPath $wscript)) { throw "Windows Script Host não está disponível." }

# Build and validate the complete task definition before touching the current worker.
$arguments = '//B //Nologo "' + $launcher + '" "' + $runner + '" "' + $InstallDir + '"'
$action = New-ScheduledTaskAction -Execute $wscript -Argument $arguments -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
# Task Scheduler requires a repetition/restart interval of at least one minute.
# The runner itself performs faster exponential retries after a worker process exits.
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$settings.Hidden = $true

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$existingXml = $null
if ($existing) {
  $existingXml = Export-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if ($existing.State -eq "Running") {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
    Start-Sleep -Seconds 2
  }
}

# Replace only the MediaForge task. If registration or startup fails, restore
# the previous task definition (when one existed) and try to start it again.
try {
  if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
  }
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Worker MediaForge em segundo plano. Não altera o Salevo antigo." -Force -ErrorAction Stop | Out-Null

  # Stop only stale MediaForge runner processes after the new task definition
  # has been accepted by Task Scheduler, so a registration error cannot leave
  # the old worker needlessly terminated.
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $roots = @($processes | Where-Object {
    $_.Name -match '^(powershell|pwsh)\.exe$' -and
    $_.CommandLine -and $_.CommandLine.IndexOf($runner,[StringComparison]::OrdinalIgnoreCase) -ge 0
  })
  $stopIds = New-Object 'System.Collections.Generic.HashSet[int]'
  foreach ($root in $roots) { [void]$stopIds.Add([int]$root.ProcessId) }
  do {
    $changed = $false
    foreach ($process in $processes) {
      if ($stopIds.Contains([int]$process.ParentProcessId) -and -not $stopIds.Contains([int]$process.ProcessId)) {
        [void]$stopIds.Add([int]$process.ProcessId)
        $changed = $true
      }
    }
  } while ($changed)
  foreach ($processId in $stopIds) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }

  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
  Start-Sleep -Seconds 2
  $state = (Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State
  if ($state -ne "Running" -and $state -ne "Queued") { throw "A tarefa do Worker não iniciou. Estado: $state" }
} catch {
  $registrationError = $_
  $current = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($current) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  }
  if ($existingXml) {
    try {
      Register-ScheduledTask -TaskName $taskName -Xml $existingXml -Force -ErrorAction Stop | Out-Null
      Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
      Write-Warning "A nova tarefa falhou; a configuração anterior do worker foi restaurada."
    } catch {
      Write-Warning ("Não foi possível restaurar a tarefa anterior: " + $_.Exception.Message)
    }
  }
  throw $registrationError
}

Write-Output "Worker MediaForge instalado como tarefa oculta de segundo plano."
Write-Output "Tarefa: $taskName | Usuário: $userId | Estado: $state"
