param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$RepoUrl = "https://github.com/thiagopantoja0911-netizen/media-forge.git",
  [string]$Branch = "feature/frame-lab-chat-mcp-20261113",
  [ValidateSet("dry-run","hyperframes")]
  [string]$Renderer = "hyperframes"
)

$ErrorActionPreference = "Stop"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js 22 ou superior precisa estar instalado antes do MediaForge."
}

$version = (& node --version).Trim()
if ($version -notmatch "^v(2[2-9]|[3-9][0-9])\.") {
  throw "Node.js 22 ou superior é necessário. Versão encontrada: $version"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
if (-not (Test-Path (Join-Path $InstallDir ".git"))) {
  if (@(Get-ChildItem -LiteralPath $InstallDir -Force -ErrorAction Stop).Count -gt 0) {
    throw "Diretório existente sem Git; não sobrescrever código ou configurações locais. Escolha uma pasta vazia de nova instalação."
  }
  & git clone --branch $Branch $RepoUrl $InstallDir
  if ($LASTEXITCODE -ne 0) { throw "Git clone falhou; nenhuma configuração existente foi sobrescrita." }
} else {
  & git -C $InstallDir fetch origin $Branch
  & git -C $InstallDir checkout $Branch
  & git -C $InstallDir pull --ff-only origin $Branch
}

Push-Location $InstallDir
try {
  & npm install
  @(
    "MEDIAFORGE_HOST=127.0.0.1",
    "MEDIAFORGE_PORT=8787",
    "MEDIAFORGE_DATA_DIR=.mediaforge",
    "MEDIAFORGE_PROJECTS_DIR=.mediaforge/projects",
    "MEDIAFORGE_OUTPUT_DIR=.mediaforge/outputs",
    "MEDIAFORGE_RENDERER=$Renderer",
    "MEDIAFORGE_REQUIRE_AUTH=false",
    "MEDIAFORGE_WORKER_ID=$env:COMPUTERNAME"
  ) | ForEach-Object -Begin { $settings = @() } -Process { $settings += $_ } -End {
    if (-not (Test-Path -LiteralPath ".env.local")) {
      [IO.File]::WriteAllLines((Join-Path $InstallDir ".env.local"),[string[]]$settings,(New-Object Text.UTF8Encoding($false)))
    }
  }
  Write-Host "MediaForge instalado em $InstallDir"
  Write-Host "Instalação de testes criada. Configure a conexão remota com: .\desktop\connect-remote.ps1"
} finally {
  Pop-Location
}
