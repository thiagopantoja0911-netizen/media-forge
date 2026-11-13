# MediaForge V2 Windows migration -- PowerShell 5.1, non-Git legacy worker.
# The legacy worker remains intact. A separate clone is activated only after validation.
[CmdletBinding()]
param(
  [string]$OldDir = (Join-Path $env:LOCALAPPDATA 'MediaForge-Staging'),
  [string]$NewDir = (Join-Path $env:LOCALAPPDATA 'MediaForge-Staging-V2'),
  [string]$Branch = 'feature/conexoes-mediaforge-primeiro',
  [string]$ExpectedCommit = '1119691dda62ce8479e9dbdbba00deb8a7c3d6ed',
  [switch]$Activate
)
$ErrorActionPreference = 'Stop'
$taskName = 'MediaForge Worker - Staging'
$repo = 'https://github.com/thiagopantoja0911-netizen/media-forge.git'
$repoMarker = 'thiagopantoja0911-netizen/media-forge'
$OldDir = [IO.Path]::GetFullPath($OldDir)
$NewDir = [IO.Path]::GetFullPath($NewDir)
if ($OldDir.TrimEnd('\') -ieq $NewDir.TrimEnd('\')) {
  throw 'A instalacao V2 deve ficar em uma pasta diferente da antiga.'
}
Write-Host 'MediaForge V2: verificacao segura da instalacao' -ForegroundColor Cyan
foreach ($path in @($OldDir, (Join-Path $OldDir '.env.local'), (Join-Path $OldDir 'desktop\run-worker.ps1'))) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Arquivo necessario ausente: $path. Nenhuma instalacao foi alterada."
  }
}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$actionArgs = (@($task.Actions) | ForEach-Object { $_.Arguments }) -join ' '
if ($actionArgs.IndexOf($NewDir, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
  Write-Host "Tarefa ja configurada para V2: $NewDir"
  exit 0
}
if ($actionArgs.IndexOf($OldDir, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw 'A tarefa aponta para outra instalacao. Nenhuma alteracao realizada.'
}
foreach ($tool in @('git','node','npm','powershell.exe')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Ferramenta necessaria nao encontrada: $tool"
  }
}
$nodeVersion = (& node --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(2[2-9]|[3-9][0-9])\.') {
  throw "Node.js 22 ou superior necessario. Encontrado: $nodeVersion"
}
if (Test-Path -LiteralPath $NewDir) {
  if (-not (Test-Path -LiteralPath (Join-Path $NewDir '.git'))) {
    throw "Destino existe mas nao e um clone Git: $($NewDir). Sem substituicao."
  }
  $origin = (& git -C $NewDir remote get-url origin | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $origin.IndexOf($repoMarker, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "Origem Git desconhecida: $($NewDir). Sem substituicao."
  }
  $currentBranch = (& git -C $NewDir symbolic-ref --short HEAD | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $currentBranch -ne $Branch) {
    throw "Branch divergente em $($NewDir): $currentBranch"
  }
  $dirty = (& git -C $NewDir status --porcelain --untracked-files=no | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $dirty) {
    throw 'Arquivos rastreados alterados na V2. Sem reset ou sobrescrita.'
  }
  & git -C $NewDir fetch origin $Branch
  if ($LASTEXITCODE -ne 0) { throw 'Falha no git fetch. Worker antigo permanece.' }
  & git -C $NewDir merge --ff-only "origin/$Branch"
  if ($LASTEXITCODE -ne 0) { throw 'Falha no git merge --ff-only. Worker antigo permanece.' }
} else {
  Write-Host "Criando instalacao separada: $NewDir"
  & git clone --branch $Branch --single-branch $repo $NewDir
  if ($LASTEXITCODE -ne 0) { throw 'Falha no git clone. Worker antigo permanece.' }
}
$commit = (& git -C $NewDir rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -ne $ExpectedCommit) {
  throw "Versao diferente da validada. Esperado: $ExpectedCommit. Encontrado: $commit. Worker antigo permanece."
}
Write-Host 'Validando dependencias e codigo na V2...'
Push-Location $NewDir
try {
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install falhou. Worker antigo permanece.' }
  foreach ($file in @('src\remote-worker-client.mjs','src\video-qa.mjs','src\renderers\hyperframes.mjs')) {
    & node --check (Join-Path $NewDir $file)
    if ($LASTEXITCODE -ne 0) { throw "Sintaxe invalida: $file" }
  }
} finally {
  Pop-Location
}
$oldEnv = Join-Path $OldDir '.env.local'
$newEnv = Join-Path $NewDir '.env.local'
if (Test-Path -LiteralPath $newEnv) {
  if ((Get-FileHash -LiteralPath $newEnv -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $oldEnv -Algorithm SHA256).Hash) {
    throw 'Configuracao V2 existente e diferente. Nada foi sobrescrito.'
  }
} else {
  Copy-Item -LiteralPath $oldEnv -Destination $newEnv
}
if ((Get-FileHash -LiteralPath $newEnv -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $oldEnv -Algorithm SHA256).Hash) {
  throw 'A copia do .env.local nao confere. Worker antigo permanece.'
}
$starter = Join-Path $NewDir 'desktop\start-worker-background.ps1'
if (-not (Test-Path -LiteralPath $starter)) { throw "Inicializador V2 nao encontrado: $starter" }
Write-Host "V2 pronta em: $NewDir" -ForegroundColor Green
Write-Host "Commit validado: $commit"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Warning 'FFmpeg nao esta no PATH desta sessao. Audio QA cinematografico pode falhar.'
}
if (-not $Activate) {
  Write-Host 'Worker antigo continua ativo. Execute novamente com -Activate para trocar a tarefa.'
  exit 0
}
$backupDir = Join-Path $OldDir 'migration-backup'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$taskBackup = Join-Path $backupDir ('worker-task-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.xml')
Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath $taskBackup -Encoding Unicode
Write-Host "Backup da tarefa salvo: $taskBackup"
$switched = $false
try {
  $oldRunner = Join-Path $OldDir 'desktop\run-worker.ps1'
  $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $roots = @($processes | Where-Object {
    $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -and
    $_.CommandLine.IndexOf($oldRunner, [StringComparison]::OrdinalIgnoreCase) -ge 0
  })
  $stopIds = New-Object 'System.Collections.Generic.HashSet[int]'
  foreach ($root in $roots) { [void]$stopIds.Add([int]$root.ProcessId) }
  do {
    $changed = $false
    foreach ($p in $processes) {
      if ($stopIds.Contains([int]$p.ParentProcessId) -and -not $stopIds.Contains([int]$p.ProcessId)) {
        [void]$stopIds.Add([int]$p.ProcessId)
        $changed = $true
      }
    }
  } while ($changed)
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  foreach ($pidToStop in $stopIds) {
    Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $starter -InstallDir $NewDir
  if ($LASTEXITCODE -ne 0) { throw 'Inicializador da V2 retornou erro.' }
  Start-Sleep -Seconds 5
  $newTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  $args2 = (@($newTask.Actions) | ForEach-Object { $_.Arguments }) -join ' '
  if ($args2.IndexOf($NewDir, [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'Tarefa nova nao aponta para V2.' }
  if ($newTask.State -notin @('Running','Queued')) { throw "Tarefa nao iniciou: $($newTask.State)" }
  $switched = $true
  Write-Host 'Tarefa Windows V2 iniciada.' -ForegroundColor Green
  Write-Host "Versao: $commit"
  Write-Host "Instalacao: $NewDir"
  Write-Host "Tarefa: $($newTask.State)"
  Write-Host 'Instalacao antiga preservada. Heartbeat e render ainda precisam ser verificados externamente.'
} finally {
  if (-not $switched) {
    Write-Warning 'Ativacao interrompida. Tentando restaurar tarefa anterior.'
    try {
      $oldStarter = Join-Path $OldDir 'desktop\start-worker-background.ps1'
      if (Test-Path -LiteralPath $oldStarter) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $oldStarter -InstallDir $OldDir
        if ($LASTEXITCODE -ne 0) { throw 'Inicializador antigo falhou.' }
      } else {
        $xml = Get-Content -LiteralPath $taskBackup -Raw -Encoding Unicode
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Register-ScheduledTask -TaskName $taskName -Xml $xml -Force -ErrorAction Stop | Out-Null
        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
      }
      Write-Host 'Tarefa anterior restaurada.' -ForegroundColor Yellow
    } catch {
      Write-Warning ('Rollback automatico falhou. Backup: ' + $taskBackup + '. Erro: ' + $_.Exception.Message)
    }
  }
}