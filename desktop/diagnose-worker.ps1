param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$ServerUrl = "https://unificmedia.salevo.site",
  [switch]$Repair
)
$ErrorActionPreference = "Stop"
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$ServerUrl = $ServerUrl.TrimEnd("/")
$ExpectedServer = "https://unificmedia.salevo.site"
$ExpectedRepo = "thiagopantoja0911-netizen/media-forge"
$ExpectedBranch = "feature/unific-media-20261116"
$TaskName = "MediaForge Worker - Staging"

if ($ServerUrl -cne $ExpectedServer) { throw "Servidor inesperado. Diagnóstico recusado." }
if (-not (Test-Path -LiteralPath $InstallDir -PathType Container)) { throw "Instalação MediaForge não encontrada em $InstallDir." }
foreach ($tool in @("node","git")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool não encontrado no PATH." }
}

Write-Output "=== Diagnóstico MediaForge Worker ==="
Write-Output ("Instalação: " + $InstallDir)
Write-Output ("Servidor: " + $ServerUrl)

$origin = (& git -C $InstallDir remote get-url origin | Out-String).Trim()
$branch = (& git -C $InstallDir symbolic-ref --short HEAD | Out-String).Trim()
$commit = (& git -C $InstallDir rev-parse HEAD | Out-String).Trim()
$dirty = (& git -C $InstallDir status --porcelain --untracked-files=no | Out-String).Trim()
$repoOk = $LASTEXITCODE -eq 0 -and $origin -match [regex]::Escape($ExpectedRepo)
$branchOk = $branch -eq $ExpectedBranch
$clean = [string]::IsNullOrWhiteSpace($dirty)
Write-Output ("Origin do repositório: " + $(if($repoOk){"OK"}else{"DIVERGENTE"}))
Write-Output ("Branch local: " + $branch)
Write-Output ("Commit local: " + $commit)
Write-Output ("Arquivos rastreados: " + $(if($clean){"limpos"}else{"alterações detectadas"}))

$envPath = Join-Path $InstallDir ".env.local"
$envLines = @()
if (Test-Path -LiteralPath $envPath -PathType Leaf) { $envLines = @(Get-Content -LiteralPath $envPath -ErrorAction Stop) }
$remoteLine = $envLines | Where-Object { $_ -match '^\s*MEDIAFORGE_REMOTE_URL=' } | Select-Object -Last 1
$configuredUrl = if($remoteLine){($remoteLine -replace '^\s*MEDIAFORGE_REMOTE_URL=','').Trim()}else{""}
$urlOk = $configuredUrl.TrimEnd("/") -ceq $ServerUrl
Write-Output ("URL remota configurada: " + $(if($urlOk){"OK"}else{"AUSENTE/INCORRETA"}))

$credentialPath = Join-Path $InstallDir ".mediaforge\worker-token.dpapi"
$legacyLine = $envLines | Where-Object { $_ -match '^\s*MEDIAFORGE_WORKER_TOKEN=' } | Select-Object -Last 1
$token = $null
$credentialKind = if(Test-Path -LiteralPath $credentialPath){"DPAPI"}elseif($legacyLine){"legada"}else{"ausente"}
$authOk = $false
$authMessage = "credencial ausente"
$ptr = [IntPtr]::Zero
$secureToken = $null
try {
  if (Test-Path -LiteralPath $credentialPath -PathType Leaf) {
    $cipher = (Get-Content -LiteralPath $credentialPath -Raw -ErrorAction Stop).Trim()
    $secureToken = ConvertTo-SecureString -String $cipher -ErrorAction Stop
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } elseif ($legacyLine) {
    $token = ($legacyLine -replace '^\s*MEDIAFORGE_WORKER_TOKEN=','').Trim()
  }
  if ($token -and $token.Length -ge 32) {
    try {
      $auth = Invoke-RestMethod -Method Post -Uri ($ServerUrl + "/v1/worker/auth-check") -Headers @{Authorization=("Bearer " + $token)} -ContentType "application/json" -Body "{}" -TimeoutSec 15
      $authOk = $auth.ok -eq $true -and $auth.authenticated -eq $true
      $authMessage = if($authOk){"autenticação aprovada"}else{"servidor recusou a credencial"}
    } catch { $authMessage = "falha na autenticação HTTPS: " + $_.Exception.Message }
  }
} finally {
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  Remove-Variable -Name token,secureToken,cipher,auth,legacyLine -ErrorAction SilentlyContinue
}
Write-Output ("Credencial local: " + $credentialKind)
Write-Output ("Pré-validação de autenticação: " + $authMessage)

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$taskState = if($task){[string]$task.State}else{"ausente"}
Write-Output ("Tarefa agendada: " + $TaskName + " · " + $taskState)

$health = $null
try { $health = Invoke-RestMethod -Method Get -Uri ($ServerUrl + "/health") -TimeoutSec 15 }
catch { Write-Output ("Health HTTPS: falhou · " + $_.Exception.Message) }
$workerOnline = $health -and $health.worker -and $health.worker.online -eq $true
$lastSeen = if($health.worker.lastSeen){[string]$health.worker.lastSeen}else{"sem heartbeat"}
Write-Output ("Worker remoto: " + $(if($workerOnline){"ONLINE"}else{"OFFLINE"}) + " · último heartbeat: " + $lastSeen)
Write-Output ("Renderer configurado: " + $(if($health.renderer){[string]$health.renderer}else{"indisponível"}))

$logFile = Join-Path $InstallDir ".mediaforge\logs\worker-session.log"
if (Test-Path -LiteralPath $logFile -PathType Leaf) {
  $tail = @(Get-Content -LiteralPath $logFile -Tail 30 -ErrorAction SilentlyContinue)
  $errors = @($tail | Where-Object { $_ -match 'ERRO:|Remote connection error:|Remote [0-9]{3}:|Heartbeat failed:' })
  Write-Output ("Log local: presente · mensagens recentes de erro: " + $errors.Count)
  foreach ($line in ($errors | Select-Object -Last 5)) { Write-Output ("  " + $line) }
} else { Write-Output "Log local: ainda não existe." }

if ($Repair) {
  if (-not $repoOk -or -not $branchOk -or -not $clean) {
    throw "Reparo automático bloqueado: confirme origin, branch $ExpectedBranch e ausência de alterações locais antes de atualizar."
  }
  if (-not $urlOk -or -not $authOk) {
    throw "Reparo bloqueado: conexão/autenticação não aprovada. Execute desktop\connect-remote.ps1 com o token atual, sem compartilhá-lo no chat."
  }
  Write-Output "Atualizando somente o clone limpo e validado do Worker..."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallDir "desktop\update-worker-safe.ps1") -InstallDir $InstallDir -Branch $ExpectedBranch
  if ($LASTEXITCODE -ne 0) { throw "Atualização segura do Worker falhou; credenciais e dados locais foram preservados." }
  Write-Output "Garantindo tarefa de segundo plano..."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallDir "desktop\start-worker-background.ps1") -InstallDir $InstallDir
  if ($LASTEXITCODE -ne 0) { throw "A tarefa do Worker não iniciou." }
  $workerOnline = $false
  for ($i=0; $i -lt 18; $i++) {
    Start-Sleep -Seconds 5
    try {
      $health = Invoke-RestMethod -Method Get -Uri ($ServerUrl + "/health") -TimeoutSec 10
      $workerOnline = $health.worker.online -eq $true
      if ($workerOnline) { break }
    } catch {}
  }
  if (-not $workerOnline) { throw "A tarefa foi reiniciada, mas o heartbeat não chegou ao servidor em 90 segundos. Verifique o log local." }
  Write-Output "REPARO APROVADO: Worker HyperFrames online e heartbeat confirmado."
} elseif (-not $workerOnline) {
  Write-Output "Diagnóstico somente leitura concluído. Para tentar atualizar e reiniciar com validação, execute novamente com -Repair."
}
