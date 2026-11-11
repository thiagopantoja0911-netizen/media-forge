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
function Invoke-Git([string[]]$Arguments) {
  & git -C $InstallDir @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Git falhou: $($Arguments -join ' ')" }
}
function Invoke-Npm([string[]]$Arguments) {
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) { throw "NPM falhou: $($Arguments -join ' ')" }
}
try {
  Add-Report "Atualização do worker MediaForge iniciada."
  Add-Report ("Instalação: " + $InstallDir)
  if (-not (Test-Path -LiteralPath (Join-Path $InstallDir ".git"))) { throw "Repositório Git não encontrado na instalação MediaForge." }
  $node = Get-Command node -ErrorAction SilentlyContinue
  $git = Get-Command git -ErrorAction SilentlyContinue
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $node -or -not $git -or -not $npm) { throw "Node.js, Git e NPM precisam estar instalados." }
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
  $trackedChanges = & git -C $InstallDir status --porcelain --untracked-files=no
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível verificar o estado do repositório local." }
  if ($trackedChanges) { throw "Existem alterações locais em arquivos rastreados. Atualização cancelada para não sobrescrevê-las." }

  $backupDir = Join-Path $logDir ("backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  Copy-Item -LiteralPath $envFile -Destination (Join-Path $backupDir ".env.local") -Force
  if (Test-Path -LiteralPath $tokenFile) { Copy-Item -LiteralPath $tokenFile -Destination (Join-Path $backupDir ".worker-token.dpapi") -Force }
  Add-Report "Configuração de conexão e token protegidos em backup local."

  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    $taskStopped = $true
    Add-Report "Worker MediaForge anterior pausado para atualização."
  }

  Invoke-Git @("fetch","origin",$Branch)
  Invoke-Git @("checkout","-B",$Branch,("origin/"+$Branch))
  Invoke-Git @("reset","--hard",("origin/"+$Branch))
  if (-not (Test-Path -LiteralPath $envFile)) { Copy-Item -LiteralPath (Join-Path $backupDir ".env.local") -Destination $envFile -Force }
  if (-not (Test-Path -LiteralPath $tokenFile) -and (Test-Path -LiteralPath (Join-Path $backupDir ".worker-token.dpapi"))) {
    Copy-Item -LiteralPath (Join-Path $backupDir ".worker-token.dpapi") -Destination $tokenFile -Force
  }
  if (-not (Test-Path -LiteralPath $envFile)) { throw "Conexão local não foi preservada." }
  Add-Report ("Código atualizado para branch " + $Branch + ".")
  Invoke-Npm @("install","--prefix",$InstallDir,"--no-audit","--no-fund")
  Invoke-Npm @("install","--prefix",(Join-Path $InstallDir "desktop\worker"),"--no-audit","--no-fund")
  Add-Report "Dependências do worker e binários locais FFmpeg/FFprobe instalados."

  $startScript = Join-Path $InstallDir "desktop\start-worker-background.ps1"
  if (-not (Test-Path -LiteralPath $startScript)) { throw "Script de inicialização em segundo plano não encontrado." }
  & $startScript -InstallDir $InstallDir
  Add-Report "Tarefa oculta MediaForge Worker - Staging reiniciada."

  $stableCount = 0
  $lastHealth = $null
  for ($attempt = 1; $attempt -le 40; $attempt++) {
    try {
      $lastHealth = Invoke-RestMethod -Uri ($ServerUrl.TrimEnd("/") + "/health") -TimeoutSec 15
      $seen = $null
      if ($lastHealth.worker.last_seen) { $seen = [DateTimeOffset]::Parse($lastHealth.worker.last_seen).UtcDateTime }
      $fresh = $seen -and (([DateTime]::UtcNow - $seen).TotalSeconds -lt 45)
      if ($lastHealth.worker.online -eq $true -and $lastHealth.worker.renderer -eq "hyperframes" -and $fresh) {
        $stableCount++
        Add-Report ("Heartbeat confirmado " + $stableCount + "/21; último sinal: " + $lastHealth.worker.last_seen)
        if ($stableCount -ge 21) { break }
      } else {
        $stableCount = 0
        Add-Report ("Aguardando heartbeat estável; online=" + $lastHealth.worker.online + "; last_seen=" + $lastHealth.worker.last_seen)
      }
    } catch {
      $stableCount = 0
      Add-Report ("Health check " + $attempt + " falhou: " + $_.Exception.Message)
    }
    Start-Sleep -Seconds 15
  }
  if ($stableCount -lt 21) { throw "O worker não manteve 21 heartbeats consecutivos em cinco minutos. Consulte worker-session-utf8.log." }
  $taskAfter = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Add-Report ("Tarefa após atualização: " + $(if ($taskAfter) { $taskAfter.State } else { "não encontrada" }))
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
  [IO.File]::WriteAllLines($reportPath,[string[]]$lines,([Text.UTF8Encoding]::new($false)))
}
