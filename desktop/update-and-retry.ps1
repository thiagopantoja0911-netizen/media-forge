[CmdletBinding()]
param(
  [string]$Branch = "feature/unific-media-20261116",
  [string]$ServerUrl = "https://unificmedia.salevo.site"
)
$ErrorActionPreference = "Stop"
$TaskName = "MediaForge Worker - Staging"
$ExpectedServer = "https://unificmedia.salevo.site"
$JobIds = @(
  "0b60285387e3408aba2c92cf68870489",
  "83c77ebd91b640bc98f235209a74a34a",
  "777c3c92c0664d95b88e440eb0d6638a"
)

if ($ServerUrl.TrimEnd("/") -cne $ExpectedServer) { throw "Servidor inesperado. Operacao recusada." }

function Resolve-InstallDir {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task -and $task.Actions.Count -gt 0) {
    $quoted = [regex]::Matches([string]$task.Actions[0].Arguments, '"([^"]+)"')
    if ($quoted.Count -ge 3) {
      $candidate = $quoted[$quoted.Count - 1].Groups[1].Value
      if (Test-Path -LiteralPath (Join-Path $candidate "desktop\update-worker-safe.ps1") -PathType Leaf) {
        return [IO.Path]::GetFullPath($candidate)
      }
    }
  }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "MediaForge-Staging-V2"),
    (Join-Path $env:LOCALAPPDATA "MediaForge-Staging")
  ) | Where-Object {
    (Test-Path -LiteralPath (Join-Path $_ ".git") -PathType Container) -and
    (Test-Path -LiteralPath (Join-Path $_ ".env.local") -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $_ "desktop\update-worker-safe.ps1") -PathType Leaf)
  }
  if ($candidates.Count -ne 1) {
    throw "Nao foi possivel identificar uma unica instalacao ativa. Nenhum arquivo foi alterado."
  }
  return [IO.Path]::GetFullPath($candidates[0])
}

$InstallDir = Resolve-InstallDir
Write-Output ("Instalacao MediaForge identificada: " + $InstallDir)

$baselineLastSeen = $null
try {
  $before = Invoke-RestMethod -Method Get -Uri ($ServerUrl + "/health") -TimeoutSec 15
  if ($before.worker.last_seen) {
    $baselineLastSeen = [DateTime]::Parse([string]$before.worker.last_seen).ToUniversalTime()
  }
} catch {}

$autoUpdater = Join-Path $PSScriptRoot "update-worker-auto.ps1"
if (-not (Test-Path -LiteralPath $autoUpdater -PathType Leaf)) {
  throw "update-worker-auto.ps1 nao esta ao lado deste arquivo. Nenhuma atualizacao foi executada."
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $autoUpdater -InstallDir $InstallDir -Branch $Branch
if ($LASTEXITCODE -ne 0) { throw "Atualizacao segura do Worker falhou. Projetos e credenciais foram preservados." }

Write-Output "Aguardando novo heartbeat do Worker..."
$workerReady = $false
for ($i = 0; $i -lt 18; $i++) {
  try {
    $health = Invoke-RestMethod -Method Get -Uri ($ServerUrl + "/health") -TimeoutSec 10
    if ($health.worker.online -eq $true -and $health.worker.last_seen) {
      $seen = [DateTime]::Parse([string]$health.worker.last_seen).ToUniversalTime()
      if ($null -eq $baselineLastSeen -or $seen -gt $baselineLastSeen) {
        $workerReady = $true
        break
      }
    }
  } catch {}
  Start-Sleep -Seconds 5
}
if (-not $workerReady) {
  throw "Worker atualizado, mas nao foi confirmado novo heartbeat em 90 segundos. Os renders nao foram reenfileirados."
}

$token = $null
$secureToken = $null
$pointer = [IntPtr]::Zero
try {
  $dpapiPath = Join-Path $InstallDir ".mediaforge\worker-token.dpapi"
  if (Test-Path -LiteralPath $dpapiPath -PathType Leaf) {
    $cipher = (Get-Content -LiteralPath $dpapiPath -Raw -ErrorAction Stop).Trim()
    $secureToken = ConvertTo-SecureString -String $cipher -ErrorAction Stop
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } else {
    $envPath = Join-Path $InstallDir ".env.local"
    $line = Get-Content -LiteralPath $envPath -ErrorAction Stop |
      Where-Object { $_ -match '^\s*MEDIAFORGE_WORKER_TOKEN=' } |
      Select-Object -Last 1
    if ($line) { $token = ($line -replace '^\s*MEDIAFORGE_WORKER_TOKEN=','').Trim() }
  }
  if (-not $token -or $token.Length -lt 32) {
    throw "Credencial do Worker nao encontrada. Nenhum render foi reenfileirado."
  }

  $requeued = @()
  foreach ($jobId in $JobIds) {
    $result = Invoke-RestMethod -Method Post -Uri ($ServerUrl + "/v1/worker/jobs/" + $jobId + "/retry") -Headers @{ Authorization = ("Bearer " + $token) } -ContentType "application/json" -Body "{}" -TimeoutSec 20
    $requeued += [pscustomobject]@{
      Original = $jobId
      Job = [string]$result.job.id
      Status = [string]$result.job.status
      AlreadyRetried = [bool]$result.alreadyRetried
    }
  }

  Write-Output ""
  Write-Output "RENDERS REENFILEIRADOS:"
  foreach ($item in $requeued) {
    Write-Output ("Original " + $item.Original + " -> novo job " + $item.Job + " (" + $item.Status + ")")
  }
  $after = Invoke-RestMethod -Method Get -Uri ($ServerUrl + "/health") -TimeoutSec 15
  Write-Output ("Fila: " + $after.worker.queued_jobs + " aguardando; " + $after.worker.processing_jobs + " em processamento.")
  Write-Output "O Worker executara ate tres tentativas de recuperacao para cada falha transitoria."
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  Remove-Variable -Name token,secureToken,cipher,line,before,health,after -ErrorAction SilentlyContinue
}
