param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$Branch = "feature/conexoes-mediaforge-primeiro"
)
$ErrorActionPreference = "Stop"
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$taskName = "MediaForge Worker - Staging"
$expected = "thiagopantoja0911-netizen/media-forge"

if (-not (Test-Path -LiteralPath (Join-Path $InstallDir ".git"))) {
  throw "Nenhum clone MediaForge encontrado em $InstallDir. Nenhum arquivo foi alterado."
}
foreach ($tool in @("node", "git")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool nao encontrado. Nenhum arquivo foi alterado."
  }
}
$origin = (& git -C $InstallDir remote get-url origin | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch [regex]::Escape($expected)) {
  throw "Origin Git inesperada. Nao foi feita nenhuma atualizacao."
}
$activeBranch = (& git -C $InstallDir symbolic-ref --short HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $activeBranch -ne $Branch) {
  throw "Branch local $activeBranch difere de $Branch. Sem checkout, merge ou reset automatico."
}
$changes = (& git -C $InstallDir status --porcelain --untracked-files=no | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $changes) {
  throw "Arquivos rastreados modificados localmente. Preserve suas alteracoes antes de atualizar. Nenhum git reset sera usado."
}
$envPath = Join-Path $InstallDir ".env.local"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Arquivo .env.local nao encontrado. Nao atualizar sem a conexao remota."
}
$previousCommit = (& git -C $InstallDir rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel identificar o commit atual." }
Write-Output "Repositorio confirmado: $expected"
Write-Output "Commit anterior: $previousCommit"
Write-Output ".env.local e .mediaforge preservados (nao sao alterados pelo script)."
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
# Do not stop a working process before fetch and syntax validation.
# The existing MediaForge background launcher owns the process-tree restart.
try {
  & git -C $InstallDir fetch --prune origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "Falhou o git fetch" }
  & git -C $InstallDir merge --ff-only "origin/$Branch"
  if ($LASTEXITCODE -ne 0) { throw "A atualizacao nao e fast-forward; nenhum reset automatico foi feito." }
  & node --check (Join-Path $InstallDir "src\remote-worker-client.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Sintaxe invalida do Worker" }
  & node --check (Join-Path $InstallDir "src\video-qa.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Sintaxe invalida do QA" }
  $current = (& git -C $InstallDir rev-parse HEAD | Out-String).Trim()
  Write-Output "Worker atualizado: $current"
  if (Get-Command ffprobe -ErrorAction SilentlyContinue) {
    Write-Output "FFprobe disponivel: QA tecnico 4K60 habilitado."
  } else {
    Write-Warning "FFprobe nao encontrado no PATH. MP4 sera marcado QA=unverified ate instalar FFmpeg/FFprobe."
  }
  if ($task) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallDir "desktop\start-worker-background.ps1") -InstallDir $InstallDir
    if ($LASTEXITCODE -ne 0) { throw "Falhou a reinicializacao segura da tarefa MediaForge." }
    Write-Output ("Tarefa MediaForge: " + (Get-ScheduledTask -TaskName $taskName).State)
  } else {
    Write-Warning "Tarefa '$taskName' nao existe. Reinicie manualmente o Worker que utiliza este clone."
  }
} catch {
  Write-Warning "Atualizacao ou reinicializacao interrompida. Os arquivos .env.local e .mediaforge nao foram modificados."
  throw
}
