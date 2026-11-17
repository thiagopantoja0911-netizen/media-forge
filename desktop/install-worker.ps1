param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$RepoUrl = "https://github.com/thiagopantoja0911-netizen/media-forge.git",
  [string]$Branch = "feature/unific-media-20261116",
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
  & git clone --single-branch --branch $Branch $RepoUrl $InstallDir
  if ($LASTEXITCODE -ne 0) { throw "Git clone falhou; nenhuma configuração existente foi sobrescrita." }
} else {
  & git -C $InstallDir fetch origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "Git fetch falhou; nenhum arquivo sera atualizado." }
  & git -C $InstallDir checkout $Branch
  if ($LASTEXITCODE -ne 0) { throw "Git checkout falhou; verifique a branch local e preserve as alteracoes existentes." }
  & git -C $InstallDir pull --ff-only origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "Git pull falhou; alteracoes locais preservadas. Instalacao interrompida antes do npm." }
}

Push-Location $InstallDir
try {
  & npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou; a configuracao nao sera anunciada como concluida." }
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
