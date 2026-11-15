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
  # Persist the worker credential encrypted with Windows DPAPI for this user.
  # It is never passed as a CLI argument or written to logs. Older .env.local
  # tokens remain readable during migration but are superseded by DPAPI.
  $credentialPath = Join-Path $InstallDir ".mediaforge\worker-token.dpapi"
  if (Test-Path -LiteralPath $credentialPath -PathType Leaf) {
    $encrypted = (Get-Content -LiteralPath $credentialPath -Raw -ErrorAction Stop).Trim()
    $secureToken = ConvertTo-SecureString -String $encrypted -ErrorAction Stop
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
      $env:MEDIAFORGE_WORKER_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
      Remove-Variable -Name secureToken,encrypted -ErrorAction SilentlyContinue
    }
  }
  if (-not $env:MEDIAFORGE_REMOTE_URL -or -not $env:MEDIAFORGE_WORKER_TOKEN) {
    throw "Conexão remota incompleta. Verifique MEDIAFORGE_REMOTE_URL e MEDIAFORGE_WORKER_TOKEN."
  }
  Add-Content -LiteralPath $logFile -Value ("[{0}] Iniciando worker remoto HyperFrames." -f (Get-Date -Format o))
  # Windows PowerShell 5.1 can promote native stderr to NativeCommandError when
  # ErrorActionPreference=Stop. Keep Node stderr in the worker log without
  # terminating this supervisor; use LASTEXITCODE for the real process result.
  $nativeErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & node ".\src\remote-worker-client.mjs" *>> $logFile
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $nativeErrorActionPreference
  }
  Add-Content -LiteralPath $logFile -Value ("[{0}] Worker encerrado. Código: {1}" -f (Get-Date -Format o),$exitCode)
} catch {
  $exitCode = 1
  Add-Content -LiteralPath $logFile -Value ("[{0}] ERRO: {1}" -f (Get-Date -Format o),($_ | Out-String))
} finally {
  Pop-Location
}
exit $exitCode
