param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging"
)
$ErrorActionPreference = "Stop"
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if (-not (Test-Path -LiteralPath $InstallDir)) { throw "MediaForge não está instalado em $InstallDir" }
$logDir = Join-Path $InstallDir ".mediaforge\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "worker-session.log"
$exitCode = 0
Push-Location $InstallDir
try {
  $envFile = Join-Path $InstallDir ".env.local"
  if (-not (Test-Path -LiteralPath $envFile)) { throw "Arquivo .env.local não encontrado." }
  Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#=\s]+)=(.*)$") {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
  }
  if (-not $env:MEDIAFORGE_REMOTE_URL -or -not $env:MEDIAFORGE_WORKER_TOKEN) {
    throw "Conexão remota incompleta. Verifique MEDIAFORGE_REMOTE_URL e MEDIAFORGE_WORKER_TOKEN."
  }
  $workerDeps = Join-Path $InstallDir "desktop\worker"
  $ffmpegPackage = Join-Path $workerDeps "node_modules\ffmpeg-static\package.json"
  $ffprobePackage = Join-Path $workerDeps "node_modules\@derhuerst\ffprobe-static\package.json"
  if (-not (Test-Path -LiteralPath $ffmpegPackage) -or -not (Test-Path -LiteralPath $ffprobePackage)) {
    Add-Content -LiteralPath $logFile -Value ("[{0}] Instalando FFmpeg/FFprobe locais do worker." -f (Get-Date -Format o))
    & npm install --prefix $workerDeps --no-audit --no-fund *>> $logFile
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependências locais FFmpeg/FFprobe." }
  }
  Add-Content -LiteralPath $logFile -Value ("[{0}] Iniciando worker remoto HyperFrames." -f (Get-Date -Format o))
  & node ".\src\remote-worker-client.mjs" *>> $logFile
  $exitCode = $LASTEXITCODE
  Add-Content -LiteralPath $logFile -Value ("[{0}] Worker encerrado. Código: {1}" -f (Get-Date -Format o),$exitCode)
} catch {
  $exitCode = 1
  Add-Content -LiteralPath $logFile -Value ("[{0}] ERRO: {1}" -f (Get-Date -Format o),($_ | Out-String))
} finally {
  Pop-Location
}
exit $exitCode
