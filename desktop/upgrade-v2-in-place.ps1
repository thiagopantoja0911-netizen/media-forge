# MediaForge V2: update the existing Windows installation in place.
# No new worker identity, no plaintext token migration, no separate startup.
# PowerShell 5.1; requires existing legacy installation and pre-staged V2 clone.
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'MediaForge-Staging'),
    [string]$StageDir = (Join-Path $env:LOCALAPPDATA 'MediaForge-Staging-V2')
)
$ErrorActionPreference = 'Stop'
$expectedCommit = '1119691dda62ce8479e9dbdbba00deb8a7c3d6ed'
$taskName = 'MediaForge Worker - Staging'
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$StageDir = [IO.Path]::GetFullPath($StageDir)
$oldRunner = Join-Path $InstallDir 'desktop\run-worker.ps1'
$oldLauncher = Join-Path $InstallDir 'desktop\launch-worker-hidden.vbs'
$oldEnv = Join-Path $InstallDir '.env.local'
$stageEnv = Join-Path $StageDir '.env.local'
$items = @('src', 'scripts', 'assets', 'studio', 'examples', 'node_modules', 'package.json', 'package-lock.json')
$backupRoot = Join-Path $InstallDir ('migration-backup\unified-v2-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$backupContents = Join-Path $backupRoot 'original-code'

function Get-MFWorkers {
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -match 'remote-worker-client\.mjs'
    })
}
function Stop-OldRunner {
    $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $roots = @($all | Where-Object {
        $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -and
        $_.CommandLine.IndexOf($oldRunner, [StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    if ($roots.Count -eq 0) { throw 'Processo PowerShell do Worker antigo nao encontrado; nao e seguro substitui-lo.' }
    $stopIds = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($p in $roots) { [void]$stopIds.Add([int]$p.ProcessId) }
    do {
        $changed = $false
        foreach ($p in $all) {
            if ($stopIds.Contains([int]$p.ParentProcessId) -and -not $stopIds.Contains([int]$p.ProcessId)) {
                [void]$stopIds.Add([int]$p.ProcessId)
                $changed = $true
            }
        }
    } while ($changed)
    foreach ($id in $stopIds) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    if (@(Get-MFWorkers).Count -ne 0) { throw 'Ainda existe Worker Node ativo; operacao interrompida.' }
}
function Start-ExistingLauncher {
    $arguments = '//B //Nologo "{0}" "{1}" "{2}"' -f $oldLauncher, $oldRunner, $InstallDir
    Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wscript.exe') `
        -ArgumentList $arguments -WorkingDirectory $InstallDir -WindowStyle Hidden
}
function Test-WorkerOnline([datetimeoffset]$since, [string]$url) {
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        Start-Sleep -Seconds 5
        $running = @(Get-MFWorkers)
        if ($running.Count -eq 1) {
            try {
                $health = Invoke-RestMethod -Uri ($url + '/health') -TimeoutSec 10
                if ($health.worker.online -eq $true -and $health.worker.last_seen -and
                    [DateTimeOffset]::Parse([string]$health.worker.last_seen) -ge $since) {
                    return $true
                }
            } catch { }
        }
    }
    return $false
}

Write-Host '=== MEDIAFORGE: ATUALIZACAO V2 NA INSTALACAO ATUAL ===' -ForegroundColor Cyan
if ($InstallDir.TrimEnd('\') -ieq $StageDir.TrimEnd('\')) { throw 'Origem e destino nao podem ser a mesma pasta.' }
foreach ($file in @($oldRunner, $oldLauncher, $oldEnv, (Join-Path $StageDir 'src\remote-worker-client.mjs'),
                   (Join-Path $StageDir '.git'), (Join-Path $StageDir 'node_modules\three\package.json'))) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Arquivo necessario ausente: $file" }
}
foreach ($item in $items) {
    if (-not (Test-Path -LiteralPath (Join-Path $StageDir $item))) {
        throw "Pacote V2 incompleto: $item"
    }
}
foreach ($program in @('git', 'node', 'wscript.exe')) {
    if (-not (Get-Command $program -ErrorAction SilentlyContinue)) { throw "Ferramenta nao encontrada: $program" }
}
$commit = (& git -C $StageDir rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -ne $expectedCommit) {
    throw "A copia V2 nao e a versao validada. Versao encontrada: $commit"
}
$dirty = (& git -C $StageDir status --porcelain --untracked-files=no | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'A copia V2 tem alteracoes de codigo; atualizacao cancelada.' }
foreach ($name in @('src\remote-worker-client.mjs', 'src\video-qa.mjs', 'src\renderers\hyperframes.mjs')) {
    & node --check (Join-Path $StageDir $name)
    if ($LASTEXITCODE -ne 0) { throw "Validacao do Node falhou: $name" }
}
$processes = @(Get-MFWorkers)
if ($processes.Count -ne 1) { throw "Esperado exatamente 1 Worker atual; encontrados: $($processes.Count)." }
$config = @{}
Get-Content -LiteralPath $oldEnv | ForEach-Object {
    if ($_ -match '^\s*([^#=\s]+)=(.*)$') { $config[$matches[1]] = $matches[2] }
}
$url = ([string]$config['MEDIAFORGE_REMOTE_URL']).TrimEnd('/')
if ($url -notmatch '^https://[a-z0-9.-]+(?::443)?$') { throw 'URL remota ausente ou inesperada.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$before = Invoke-RestMethod -Uri ($url + '/health') -TimeoutSec 15
if ($before.worker.online -ne $true) { throw 'Servidor nao reconhece o Worker atual. Nenhum arquivo alterado.' }
if ($before.worker.queued_jobs -gt 0 -or $before.worker.processing_jobs -gt 0) {
    throw 'Existe renderizacao pendente/em andamento; atualizacao cancelada.'
}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task -and $task.State -ne 'Disabled') {
    throw 'Tarefa agendada nao esta desativada. Pare aqui para evitar inicializacao duplicada.'
}
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'MediaForge Worker.lnk'
if (-not (Test-Path -LiteralPath $startup)) { throw 'Atalho de inicializacao automatica nao encontrado.' }
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($startup)
if ($shortcut.Arguments.IndexOf($InstallDir,[StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $shortcut.Arguments.IndexOf($oldRunner,[StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw 'Atalho de inicializacao nao aponta para o Worker atual.'
}
Write-Host 'Versao V2 confirmada; autenticacao antiga e inicializacao automatica preservadas.' -ForegroundColor Green
Write-Host 'Nenhuma fila de renderizacao ativa. Fazendo backup da instalacao atual...'
New-Item -ItemType Directory -Path $backupContents -Force | Out-Null
$backedUp = New-Object 'System.Collections.Generic.List[string]'
$changedItems = New-Object 'System.Collections.Generic.List[string]'
$stopped = $false
$success = $false
$startError = $null
try {
    $stopped = $true
    Stop-OldRunner
    foreach ($item in $items) {
        $target = Join-Path $InstallDir $item
        if (Test-Path -LiteralPath $target) {
            Move-Item -LiteralPath $target -Destination (Join-Path $backupContents $item) -ErrorAction Stop
            [void]$backedUp.Add($item)
        }
        [void]$changedItems.Add($item)
        Copy-Item -LiteralPath (Join-Path $StageDir $item) -Destination $target -Recurse -Force -ErrorAction Stop
    }
    # Keep legacy desktop/run-worker.ps1 and its DPAPI token file untouched.
    # They now launch the V2 src/remote-worker-client.mjs from the SAME folder.
    $hashExpected = (Get-FileHash -LiteralPath (Join-Path $StageDir 'src\remote-worker-client.mjs') -Algorithm SHA256).Hash
    $hashActual = (Get-FileHash -LiteralPath (Join-Path $InstallDir 'src\remote-worker-client.mjs') -Algorithm SHA256).Hash
    if ($hashActual -ne $hashExpected) { throw 'Codigo V2 copiado nao confere com o original.' }
    $started = [DateTimeOffset]::UtcNow
    Start-ExistingLauncher
    if (-not (Test-WorkerOnline $started $url)) { throw 'Novo Worker nao confirmou processo unico e heartbeat; revertendo.' }
    $success = $true
    Write-Host 'MEDIAFORGE V2 ATUALIZADO NA INSTALACAO ORIGINAL.' -ForegroundColor Green
    Write-Host 'Pasta ativa: MediaForge-Staging'
    Write-Host 'Versao: 1119691dda62ce8479e9dbdbba00deb8a7c3d6ed'
    Write-Host 'Worker ativo: 1 | Conexao: OK | Inicio automatico: atalho existente'
    Write-Host "Backup do codigo anterior: $backupContents"
} catch {
    $startError = $_.Exception.Message
    Write-Warning "Falha na atualizacao: $startError"
    if ($stopped) {
        try {
            $current = @(Get-MFWorkers)
            if ($current.Count -gt 0) {
                # Kill the existing launcher if one was started during this attempt.
                $all = @(Get-CimInstance Win32_Process)
                $parents = @($all | Where-Object {
                    $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -and
                    $_.CommandLine.IndexOf($oldRunner,[StringComparison]::OrdinalIgnoreCase) -ge 0
                })
                foreach ($p in $parents) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
                foreach ($p in $current) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
                Start-Sleep -Seconds 2
            }
            foreach ($item in $changedItems) {
                $target = Join-Path $InstallDir $item
                if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop }
                $original = Join-Path $backupContents $item
                if (Test-Path -LiteralPath $original) { Move-Item -LiteralPath $original -Destination $target -ErrorAction Stop }
            }
            Start-ExistingLauncher
            if (Test-WorkerOnline ([DateTimeOffset]::UtcNow.AddSeconds(-5)) $url) {
                Write-Host 'Worker antigo restaurado e online.' -ForegroundColor Yellow
            } else {
                Write-Warning 'Codigo restaurado, mas conexao nao confirmada. Verifique o Worker.'
            }
        } catch {
            Write-Warning ('ROLLBACK INCOMPLETO: ' + $_.Exception.Message)
            Write-Warning ('Backup original em: ' + $backupContents)
        }
    } else {
        Write-Warning 'Nenhum arquivo de codigo foi alterado.'
    }
    throw "Atualizacao V2 nao concluida: $startError"
}
if ($success) {
    # One worker directory and one startup mechanism. Keep backup of previous code.
    try {
        if ($task) {
            Export-ScheduledTask -TaskName $taskName |
                Set-Content -LiteralPath (Join-Path $backupRoot 'old-scheduled-task.xml') -Encoding Unicode
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
            Write-Host 'Tarefa antiga removida; somente o atalho inicia o Worker.'
        }
    } catch {
        Write-Warning ('Tarefa antiga continuou desativada: ' + $_.Exception.Message)
    }
    try {
        Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction Stop
        Write-Host 'Pasta V2 separada removida (codigo incorporado na instalacao original).'
    } catch {
        Write-Warning 'V2 ativa na pasta original; pasta de preparacao ainda existe e pode ser removida depois.'
    }
    Write-Host 'ATUALIZACAO UNIFICADA CONCLUIDA.' -ForegroundColor Green
}
