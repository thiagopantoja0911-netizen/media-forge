param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$ServerUrl = "https://mediaforge.salevo.site",
  [string]$Branch = "migration/creator-video-to-mediaforge"
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$logDir = Join-Path $InstallDir ".mediaforge\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$reportPath = Join-Path $logDir "ATUALIZACAO_WORKER_MEDIAFORGE.txt"
$logPath = Join-Path $logDir "update-worker.log"
$taskName = "MediaForge Worker - Staging"
$taskStopped = $false
$lines = New-Object System.Collections.Generic.List[string]
function Add-Report([string]$Text) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text
  $lines.Add($line)
  Add-Content -LiteralPath $logPath -Encoding UTF8 -Value $line
}
function Invoke-Npm([string[]]$Arguments) {
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) { throw "NPM falhou: $($Arguments -join ' ')" }
}
try {
  Add-Report "Atualização do worker MediaForge iniciada."
  Add-Report ("Instalação: " + $InstallDir)
  if (-not (Test-Path -LiteralPath $InstallDir)) { throw "Diretório de instalação não encontrado: $InstallDir" }
  $node = Get-Command node -ErrorAction SilentlyContinue
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  $robocopy = Get-Command robocopy -ErrorAction SilentlyContinue
  if (-not $node -or -not $npm -or -not $robocopy) { throw "Node.js 22+, NPM e Robocopy precisam estar disponíveis no Windows." }
  $nodeVersion = (& node --version).Trim()
  if ($nodeVersion -notmatch "^v(2[2-9]|[3-9][0-9])\.") { throw "Node.js 22 ou superior é necessário. Encontrado: $nodeVersion" }

  $envFile = Join-Path $InstallDir ".env.local"
  $tokenFile = Join-Path $InstallDir ".worker-token.dpapi"
  if (-not (Test-Path -LiteralPath $envFile)) { throw "Arquivo .env.local não encontrado; conexão não será recriada automaticamente." }
  $envLines = @(Get-Content -LiteralPath $envFile)
  $remoteLine = $envLines | Where-Object { $_ -match '^MEDIAFORGE_REMOTE_URL=(.+)$' } | Select-Object -First 1
  if (-not $remoteLine) { throw "MEDIAFORGE_REMOTE_URL não encontrado no .env.local." }
  $configuredUrl = ($remoteLine -replace '^MEDIAFORGE_REMOTE_URL=', '').Trim().TrimEnd("/")
  if ($configuredUrl -ne $ServerUrl.TrimEnd("/")) { throw "A instalação está conectada a outro servidor. Nenhuma configuração foi alterada." }
  $hasPlainToken = [bool]($envLines | Where-Object { $_ -match '^MEDIAFORGE_WORKER_TOKEN=.{32,}$' })
  if (-not (Test-Path -LiteralPath $tokenFile) -and -not $hasPlainToken) { throw "Token do worker não encontrado. Nenhuma credencial será recriada." }

  if (Test-Path -LiteralPath $tokenFile) {
    Add-Type -AssemblyName System.Security
    $encrypted = [IO.File]::ReadAllBytes($tokenFile)
    $clear = [Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    try {
      if ([Text.Encoding]::UTF8.GetString($clear).Length -lt 32) { throw "Token DPAPI inválido." }
    } finally { [Array]::Clear($clear,0,$clear.Length) }
  }
  Add-Report "Conexão HTTPS e credencial local verificadas sem exibir o token."

  $apiHeaders = @{ "User-Agent" = "MediaForge-Windows-Updater"; "Accept" = "application/vnd.github+json" }
  $branchQuery = [Uri]::EscapeDataString($Branch)
  $commitApi = "https://api.github.com/repos/thiagopantoja0911-netizen/media-forge/commits?sha=$branchQuery&per_page=1"
  $latest = Invoke-RestMethod -Uri $commitApi -Headers $apiHeaders -TimeoutSec 30
  if (-not $latest -or -not $latest[0].sha -or $latest[0].sha -notmatch '^[0-9a-f]{40}$') {
    throw "Não foi possível identificar uma versão válida do MediaForge no GitHub."
  }
  $targetSha = $latest[0].sha
  $tempRoot = Join-Path $env:TEMP ("MediaForge-update-" + [Guid]::NewGuid().ToString("N"))
  $archivePath = Join-Path $tempRoot "mediaforge.zip"
  $extractDir = Join-Path $tempRoot "source"
  New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
  Add-Report ("Baixando pacote oficial do GitHub; commit " + $targetSha.Substring(0,12) + ".")
  $archiveUrl = "https://codeload.github.com/thiagopantoja0911-netizen/media-forge/zip/" + $targetSha
  Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath -UseBasicParsing -TimeoutSec 120
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDir -Force
  $sourceDir = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
  if (-not $sourceDir) { throw "O pacote do GitHub foi baixado, mas não contém a pasta do projeto." }
  $requiredFiles = @(
    "package.json",
    "src\remote-worker-client.mjs",
    "desktop\run-worker.ps1",
    "desktop\start-worker-background.ps1",
    "desktop\worker\package.json"
  )
  foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceDir.FullName $relativePath))) {
      throw "Pacote incompleto do GitHub: $relativePath não encontrado."
    }
  }
  Add-Report "Pacote oficial baixado e estrutura validada."

  $backupDir = Join-Path $logDir ("backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  Copy-Item -LiteralPath $envFile -Destination (Join-Path $backupDir ".env.local") -Force
  if (Test-Path -LiteralPath $tokenFile) { Copy-Item -LiteralPath $tokenFile -Destination (Join-Path $backupDir ".worker-token.dpapi") -Force }
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls $backupDir /inheritance:r /grant:r ('*' + $sid + ':(OI)(CI)(F)') /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível proteger o backup local da conexão." }
  Add-Report "Credenciais e configurações preservadas em backup protegido."

  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    $taskStopped = $true
    Add-Report "Worker MediaForge anterior pausado para atualização."
  }

  $copyArgs = @(
    $sourceDir.FullName,$InstallDir,
    "/E","/COPY:DAT","/DCOPY:DAT","/R:2","/W:2","/NFL","/NDL","/NJH","/NJS","/NP",
    "/XD",".git","node_modules",".mediaforge",
    "/XF",".env",".env.*"
  )
  & robocopy @copyArgs
  $copyCode = $LASTEXITCODE
  if ($copyCode -ge 8) { throw "Falha ao copiar o pacote do MediaForge (Robocopy $copyCode)." }
  Add-Report ("Arquivos do MediaForge atualizados sem sobrescrever .env.local, token, projetos, logs ou node_modules. Robocopy=" + $copyCode)

  Invoke-Npm @("install","--prefix",(Join-Path $InstallDir "desktop\worker"),"--no-audit","--no-fund")
  Add-Report "Dependências locais FFmpeg/FFprobe instaladas."

  $startScript = Join-Path $InstallDir "desktop\start-worker-background.ps1"
  if (-not (Test-Path -LiteralPath $startScript)) { throw "Script de inicialização em segundo plano não encontrado." }
  & $startScript -InstallDir $InstallDir
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "O script de inicialização do worker retornou erro." }
  $taskStopped = $false
  Add-Report "Tarefa oculta MediaForge Worker - Staging reiniciada."

  $stableCount = 0
  for ($attempt = 1; $attempt -le 40; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri ($ServerUrl.TrimEnd("/") + "/health") -TimeoutSec 15
      $seen = $null
      if ($health.worker.last_seen) { $seen = [DateTimeOffset]::Parse($health.worker.last_seen).UtcDateTime }
      $fresh = $seen -and (([DateTime]::UtcNow - $seen).TotalSeconds -lt 45)
      if ($health.worker.online -eq $true -and $health.worker.renderer -eq "hyperframes" -and $fresh) {
        $stableCount++
        Add-Report ("Heartbeat confirmado " + $stableCount + "/21; último sinal: " + $health.worker.last_seen)
        if ($stableCount -ge 21) { break }
      } else {
        $stableCount = 0
        Add-Report ("Aguardando heartbeat estável; online=" + $health.worker.online + "; last_seen=" + $health.worker.last_seen)
      }
    } catch {
      $stableCount = 0
      Add-Report ("Health check " + $attempt + " falhou: " + $_.Exception.Message)
    }
    Start-Sleep -Seconds 15
  }
  if ($stableCount -lt 21) { throw "O worker não manteve 21 heartbeats consecutivos em cinco minutos. Consulte worker-session-utf8.log." }
  Add-Report ("Tarefa após atualização: " + (Get-ScheduledTask -TaskName $taskName).State)
  Add-Report "RESULTADO: worker atualizado e heartbeat estável por pelo menos cinco minutos."
} catch {
  Add-Report ("ERRO: " + $_.Exception.Message)
  if ($taskStopped) {
    try {
      $recovery = Join-Path $InstallDir "desktop\start-worker-background.ps1"
      if (Test-Path -LiteralPath $recovery) {
        & $recovery -InstallDir $InstallDir
        Add-Report "Tentativa de recuperação da tarefa MediaForge concluída."
      }
    } catch { Add-Report ("Falha na recuperação automática: " + $_.Exception.Message) }
  }
} finally {
  $workerLog = Join-Path $logDir "worker-session-utf8.log"
  if (Test-Path -LiteralPath $workerLog) {
    Add-Report "Últimas linhas do log do worker:"
    Get-Content -LiteralPath $workerLog -Tail 60 -ErrorAction SilentlyContinue | ForEach-Object { Add-Report ("WORKER: " + $_) }
  }
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
  [IO.File]::WriteAllLines($reportPath,[string[]]$lines,([Text.UTF8Encoding]::new($false)))
}
