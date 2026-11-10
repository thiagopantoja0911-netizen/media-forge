param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge"
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
  & npm run worker
} finally {
  Pop-Location
}
