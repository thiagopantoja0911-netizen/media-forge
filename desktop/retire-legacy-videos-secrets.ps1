param(
  [string]$ServerUrl = "https://mediaforge.salevo.site",
  [switch]$Apply,
  [switch]$VerifiedRender
)
$ErrorActionPreference = "Stop"
$taskName = "VideosSecretsBackgroundRenderer"
$legacyRoot = Join-Path $env:LOCALAPPDATA "VideosSecretsAgent"
$startupLink = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Videos Secrets Agent.lnk"
$logRoot = Join-Path $env:LOCALAPPDATA "MediaForge-Staging\.mediaforge\logs"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$report = Join-Path $logRoot "LEGACY_RETIREMENT_REPORT.txt"
$lines = New-Object System.Collections.Generic.List[string]
function Add-Report([string]$Text) {
  $lines.Add(("[{0}] {1}" -f (Get-Date -Format o), $Text))
}
try {
  Add-Report "Legacy Videos Secrets retirement audit."
  Add-Report ("Legacy agent directory preserved: " + $legacyRoot)
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Add-Report ("Legacy scheduled task present: " + [bool]$task)
  Add-Report ("Legacy startup shortcut present: " + (Test-Path -LiteralPath $startupLink))
  $legacyPaths = @(
    (Join-Path $legacyRoot "worker.mjs"),
    (Join-Path $legacyRoot "worker-desktop.mjs"),
    (Join-Path $legacyRoot "Iniciar-Agente.ps1")
  )
  $matches = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $process = $_
    $process.Name -match '^(node|powershell|pwsh)\.exe
  Add-Report ("Legacy worker processes found: " + $matches.Count)
  if (-not $Apply) {
    Add-Report "DRY RUN: nothing was stopped or removed. Use -Apply -VerifiedRender only after a real MediaForge 4K60 render has passed review."
  } else {
    if (-not $VerifiedRender) { throw "Safety gate: pass -VerifiedRender only after a real 4K60 High MP4 has passed FFprobe and visual/audio review." }
    $health = Invoke-RestMethod -Uri ($ServerUrl.TrimEnd("/") + "/health") -TimeoutSec 15
    if ($health.worker.online -ne $true -or $health.worker.renderer -ne "hyperframes") {
      throw "Safety gate: MediaForge Windows HyperFrames worker is not online."
    }
    if ($task) {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
      Add-Report "Stopped and removed only VideosSecretsBackgroundRenderer."
    }
    if (Test-Path -LiteralPath $startupLink) {
      Remove-Item -LiteralPath $startupLink -Force
      Add-Report "Removed only the Videos Secrets Agent startup shortcut."
    }
    foreach ($process in $matches) {
      Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
      Add-Report ("Stopped legacy worker process PID " + $process.ProcessId)
    }
    Add-Report "Legacy agent files, token, logs, projects and MP4 exports were NOT deleted."
    Add-Report "RESULT: legacy Windows background worker retired; MediaForge remains active."
  }
} catch {
  Add-Report ("ERROR: " + $_.Exception.Message)
} finally {
  [IO.File]::WriteAllLines($report,[string[]]$lines,([Text.UTF8Encoding]::new($false)))
}
 -and $process.CommandLine -and
    @($legacyPaths | Where-Object { $process.CommandLine.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0
  })
  Add-Report ("Legacy worker processes found: " + $matches.Count)
  if (-not $Apply) {
    Add-Report "DRY RUN: nothing was stopped or removed. Use -Apply -VerifiedRender only after a real MediaForge 4K60 render has passed review."
  } else {
    if (-not $VerifiedRender) { throw "Safety gate: pass -VerifiedRender only after a real 4K60 High MP4 has passed FFprobe and visual/audio review." }
    $health = Invoke-RestMethod -Uri ($ServerUrl.TrimEnd("/") + "/health") -TimeoutSec 15
    if ($health.worker.online -ne $true -or $health.worker.renderer -ne "hyperframes") {
      throw "Safety gate: MediaForge Windows HyperFrames worker is not online."
    }
    if ($task) {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
      Add-Report "Stopped and removed only VideosSecretsBackgroundRenderer."
    }
    if (Test-Path -LiteralPath $startupLink) {
      Remove-Item -LiteralPath $startupLink -Force
      Add-Report "Removed only the Videos Secrets Agent startup shortcut."
    }
    foreach ($process in $matches) {
      Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
      Add-Report ("Stopped legacy worker process PID " + $process.ProcessId)
    }
    Add-Report "Legacy agent files, token, logs, projects and MP4 exports were NOT deleted."
    Add-Report "RESULT: legacy Windows background worker retired; MediaForge remains active."
  }
} catch {
  Add-Report ("ERROR: " + $_.Exception.Message)
} finally {
  [IO.File]::WriteAllLines($report,[string[]]$lines,([Text.UTF8Encoding]::new($false)))
}
