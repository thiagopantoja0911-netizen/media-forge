# Unific Desktop V1: non-destructive, per-user, automated worker bootstrap.
# Run by the Electron app as the logged-in Windows user; no remote arbitrary shell.
$ErrorActionPreference = 'Stop'
$folder = Join-Path $env:LOCALAPPDATA 'MediaForge-Staging-V2'
$source = 'https://github.com/thiagopantoja0911-netizen/media-forge.git'
$branch = 'feature/unific-media-20261116'
function Find-Tool([string]$name, [string[]]$fallback) {
  $found = Get-Command $name -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  foreach ($item in $fallback) { if (Test-Path -LiteralPath $item) { return $item } }
  return $null
}
function Ensure-Tool([string]$name, [string]$package, [string[]]$fallback) {
  $exe = Find-Tool $name $fallback
  if ($exe) { return $exe }
  $winget = Find-Tool 'winget.exe' @()
  if (-not $winget) { throw "$name não instalado e winget não está disponível. Instalação preservada." }
  Write-Output "Instalando $name via Windows Package Manager ..."
  & $winget install --id $package --exact --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) { throw "winget não conseguiu instalar $name (código $LASTEXITCODE)." }
  $exe = Find-Tool $name $fallback
  if (-not $exe) { throw "$name foi instalado, mas não está acessível. Reabra o Unific Desktop." }
  return $exe
}
$node = Ensure-Tool 'node.exe' 'OpenJS.NodeJS.LTS' @('C:\Program Files\nodejs\node.exe')
$git = Ensure-Tool 'git.exe' 'Git.Git' @('C:\Program Files\Git\cmd\git.exe')
$npm = Find-Tool 'npm.cmd' @('C:\Program Files\nodejs\npm.cmd')
if (-not $npm) { throw 'npm.cmd não encontrado após instalar Node.js.' }
$version = (& $node --version)
if ($version -notmatch '^v(2[2-9]|[3-9][0-9])\.') { throw "Node.js 22+ necessário: $version" }
if (Test-Path (Join-Path $folder 'desktop\run-worker.ps1')) {
  Write-Output "Instalação existente encontrada: $folder"
  Write-Output 'Nenhum arquivo existente foi sobrescrito ou excluído.'
} elseif (Test-Path -LiteralPath $folder) {
  throw 'A pasta MediaForge-Staging-V2 existe mas não é uma instalação válida. Não será apagada ou substituída.'
} else {
  Write-Output 'Clonando MediaForge em nova pasta...'
  & $git clone --single-branch --depth 1 --branch $branch $source $folder
  if ($LASTEXITCODE -ne 0) { throw 'Falha no git clone.' }
  Push-Location $folder
  try {
    & $npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Falha na instalação de dependências do worker.' }
    if (-not (Test-Path '.env.local')) {
      [IO.File]::WriteAllText((Join-Path $folder '.env.local'), "MEDIAFORGE_REMOTE_URL=https://unificmedia.salevo.site`nMEDIAFORGE_RENDERER=hyperframes`n",[Text.UTF8Encoding]::new($false))
    }
  } finally { Pop-Location }
  Write-Output 'Worker preparado sem modificar instalações anteriores.'
}
$dpapi = Join-Path $folder '.mediaforge\worker-token.dpapi'
$envFile = Join-Path $folder '.env.local'
if ((Test-Path $dpapi) -or ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^MEDIAFORGE_WORKER_TOKEN=' -Quiet))) {
  & (Join-Path $folder 'desktop\start-worker-background.ps1') -InstallDir $folder
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar a tarefa do worker.' }
  Write-Output 'Worker iniciado como tarefa em segundo plano.'
} else {
  Write-Output 'Instalação preparada. Falta configurar o token Worker autorizado; nenhuma credencial foi inventada.'
}
