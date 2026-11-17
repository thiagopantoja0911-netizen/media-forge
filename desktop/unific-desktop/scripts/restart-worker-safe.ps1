param([Parameter(Mandatory=$true)][string]$InstallDir)
$ErrorActionPreference = 'Stop'
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$runner = Join-Path $InstallDir 'desktop\run-worker.ps1'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
  throw 'Worker não instalado. Execute Preparar dependências antes.'
}
$taskName = 'MediaForge Worker - Staging'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  try {
    if ($task.State -eq 'Running') {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
      Start-Sleep -Seconds 1
    }
    Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
  } catch [System.UnauthorizedAccessException] {
    throw 'A tarefa já existe, mas está protegida pelo Windows. Abra o Unific Desktop como administrador para reiniciar. Não removi a tarefa.'
  } catch {
    if ($_.Exception.Message -match 'acesso negado|access is denied|0x80070005') {
      throw 'Acesso negado à tarefa existente. Nenhuma tarefa foi desregistrada. Peça autorização de administrador.'
    }
    throw
  }
  Start-Sleep -Seconds 2
  $result = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if ($result.State -notin @('Running','Queued')) {
    throw ('A tarefa foi acionada mas não permaneceu em execução (estado: '+$result.State+'). Verifique o diagnóstico.')
  }
  Write-Output ('Tarefa existente reiniciada sem recriação. Estado: '+$result.State)
} else {
  $envFile = Join-Path $InstallDir '.env.local'
  $dpapi = Join-Path $InstallDir '.mediaforge\worker-token.dpapi'
  if (-not (Test-Path -LiteralPath $envFile)) { throw 'Arquivo de conexão do worker ausente. Configure a conexão antes de iniciar.' }
  if (-not (Test-Path -LiteralPath $dpapi) -and -not (Select-String -LiteralPath $envFile -Pattern '^MEDIAFORGE_WORKER_TOKEN=' -Quiet)) {
    throw 'Credencial do worker ausente. Não foi criado token fictício.'
  }
  # No task exists, so run the existing supervisor hidden. Never register or replace tasks.
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$runner+'" -InstallDir "'+$InstallDir+'"'
  Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -WorkingDirectory $InstallDir -ErrorAction Stop | Out-Null
  Write-Output 'Worker iniciado em segundo plano. Nenhuma tarefa agendada foi criada ou alterada.'
}
