param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $InstallDir)) {
  throw "MediaForge não está instalado em $InstallDir"
}

Push-Location $InstallDir
try {
  if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
      if ($_ -match "^([^=]+)=(.*)$") {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
      }
    }
  }
  if ($env:MEDIAFORGE_REMOTE_URL -and $env:MEDIAFORGE_WORKER_TOKEN) {
    & npm run worker:remote
  } else {
    & npm run worker
  }
} finally {
  Pop-Location
}
