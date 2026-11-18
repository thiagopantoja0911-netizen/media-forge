[CmdletBinding()]
param(
  [string]$InstallDir = "",
  [string]$Branch = "feature/unific-media-20261116"
)
$ErrorActionPreference = "Stop"
$taskName = "MediaForge Worker - Staging"

# Prefer the directory actually referenced by the active scheduled task.
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task -and $task.Actions.Count -gt 0) {
    $arguments = [string]$task.Actions[0].Arguments
    $quoted = [regex]::Matches($arguments, '"([^"]+)"')
    if ($quoted.Count -ge 3) {
      $candidate = $quoted[$quoted.Count - 1].Groups[1].Value
      if (Test-Path -LiteralPath (Join-Path $candidate "desktop\update-worker-safe.ps1") -PathType Leaf) {
        $InstallDir = $candidate
      }
    }
  }
}

# If there is no active task, accept one unambiguous installed clone only.
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "MediaForge-Staging-V2"),
    (Join-Path $env:LOCALAPPDATA "MediaForge-Staging")
  ) | Where-Object {
    (Test-Path -LiteralPath (Join-Path $_ ".git") -PathType Container) -and
    (Test-Path -LiteralPath (Join-Path $_ ".env.local") -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $_ "desktop\update-worker-safe.ps1") -PathType Leaf)
  }
  if ($candidates.Count -ne 1) {
    throw "Não foi possível identificar uma única instalação ativa. Informe -InstallDir explicitamente; nenhuma alteração foi feita."
  }
  $InstallDir = $candidates[0]
}

$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$updater = Join-Path $InstallDir "desktop\update-worker-safe.ps1"
if (-not (Test-Path -LiteralPath $updater -PathType Leaf)) {
  throw "Atualizador seguro não encontrado em $updater. Nenhum arquivo foi alterado."
}

Write-Output "Instalação selecionada pelo agendamento/validação: $InstallDir"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -InstallDir $InstallDir -Branch $Branch
if ($LASTEXITCODE -ne 0) {
  throw "Atualização segura falhou. Configurações, credenciais e projetos foram preservados."
}
Write-Output "Worker MediaForge atualizado. Confirme o heartbeat antes de iniciar novos renders."
