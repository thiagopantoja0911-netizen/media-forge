# Prepara uma instalação V2 sem alterar o worker ativo, o agendamento nem credenciais.
# Para migrar uma instalação sem .git. A ativação é um procedimento separado.
[CmdletBinding()]
param(
  [string]$CurrentDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$StagingDir = "$env:LOCALAPPDATA\MediaForge-Staging-V2",
  [string]$Branch = "feature/unific-media-20261116",
  [Parameter(Mandatory=$true)][string]$ExpectedCommit,
  [switch]$VerifyAuthentication
)
$ErrorActionPreference = "Stop"
$CurrentDir = [IO.Path]::GetFullPath($CurrentDir)
$StagingDir = [IO.Path]::GetFullPath($StagingDir)
if ($CurrentDir -eq $StagingDir) { throw "Origens e destino iguais: recusado." }
if ($ExpectedCommit -notmatch "^[0-9a-f]{40}$") { throw "Informe SHA-1 completo da revisão homologada (40 caracteres)." }
if (-not (Test-Path -LiteralPath $CurrentDir -PathType Container)) {
  throw "A instalação original não existe. Não houve alteração."
}
if (Test-Path -LiteralPath (Join-Path $CurrentDir ".git")) {
  throw "A instalação original contém Git. Use o atualizador normal, não a migração sem Git."
}
$oldEnv = Join-Path $CurrentDir ".env.local"
if (-not (Test-Path -LiteralPath $oldEnv -PathType Leaf)) {
  throw "Configuração existente não localizada. O worker ativo não será alterado."
}
if (Test-Path -LiteralPath $StagingDir) {
  throw "Destino já existe. Recusado para não sobrescrever outros dados."
}
foreach ($command in @("node", "git", "npm")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command não está instalado. A instalação atual foi preservada."
  }
}
$version = (& node --version).Trim()
if ($version -notmatch "^v(2[2-9]|[3-9][0-9])\.") {
  throw "Node.js 22+ é necessário; a instalação original não foi alterada."
}
$repo = "https://github.com/thiagopantoja0911-netizen/media-forge.git"
Write-Output "Iniciando preparação isolada de V2; tarefa Windows em execução não será tocada."
& git clone --quiet --single-branch --branch $Branch $repo $StagingDir
if ($LASTEXITCODE -ne 0) { throw "Clone falhou. O diretório original continua intacto." }
$commit = (& git -C $StagingDir rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -ne $ExpectedCommit) {
  throw "Commit recebido não corresponde à versão auditada. Não foi feita nenhuma ativação."
}
Push-Location $StagingDir
try {
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "Dependências V2 não foram instaladas. Sem impacto na V1." }
  foreach ($source in @("src\remote-worker-client.mjs", "src\video-qa.mjs")) {
    & node --check $source
    if ($LASTEXITCODE -ne 0) { throw "Falha de sintaxe V2: $source. Sem impacto na V1." }
  }
  $sourceText = Get-Content -LiteralPath "src\remote-worker-client.mjs" -Raw
  if ($sourceText -notmatch "uploadDeliveredArtifact") {
    throw "A V2 não implementa entrega de MP4. Nenhuma ativação foi feita."
  }
} finally {
  Pop-Location
}
# As permissões da NOVA cópia são restritas ao usuário Windows atual.
# Nunca enviar, imprimir ou inserir credenciais no GitHub ou no chat.
$newEnv = Join-Path $StagingDir ".env.local"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
Copy-Item -LiteralPath $oldEnv -Destination $newEnv -ErrorAction Stop
& icacls $newEnv /inheritance:r /grant:r ('*' + $identity + ':(F)') | Out-Null
if ($LASTEXITCODE -ne 0) { throw "ACL da cópia de configuração não pôde ser restringida. Sem ativação." }
$oldCredential = Join-Path $CurrentDir ".mediaforge\worker-token.dpapi"
if (Test-Path -LiteralPath $oldCredential -PathType Leaf) {
  $newState = Join-Path $StagingDir ".mediaforge"
  New-Item -ItemType Directory -Path $newState -Force | Out-Null
  $newCredential = Join-Path $newState "worker-token.dpapi"
  Copy-Item -LiteralPath $oldCredential -Destination $newCredential -ErrorAction Stop
  & icacls $newCredential /inheritance:r /grant:r ('*' + $identity + ':(F)') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ACL DPAPI falhou. Sem ativação." }
}
if ($VerifyAuthentication) {
  $token = $null
  $secure = $null
  try {
    $encryptedPath = Join-Path $StagingDir ".mediaforge\worker-token.dpapi"
    if (Test-Path -LiteralPath $encryptedPath) {
      $secure = ConvertTo-SecureString -String ((Get-Content -LiteralPath $encryptedPath -Raw).Trim())
      $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    } else {
      $line = Get-Content -LiteralPath $newEnv | Where-Object { $_ -match "^MEDIAFORGE_WORKER_TOKEN=" } | Select-Object -Last 1
      if ($line) { $token = $line.Substring("MEDIAFORGE_WORKER_TOKEN=".Length) }
    }
    if (-not $token -or $token.Length -lt 32) {
      throw "Não há token reutilizável; configuração requer procedimento autorizado."
    }
    $r = Invoke-RestMethod -Method Post -Uri "https://unificmedia.salevo.site/v1/worker/auth-check" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body "{}" -TimeoutSec 15
    if ($r.ok -ne $true -or $r.authenticated -ne $true) { throw "O servidor recusou autenticação." }
    Write-Output "Pré-validação de autenticação HTTPS: aprovada."
  } finally {
    Remove-Variable -Name token,secure,r,line -ErrorAction SilentlyContinue
  }
}
Write-Output ("V2 preparada com commit " + $commit + " em " + $StagingDir)
Write-Output "V1, tarefa agendada, processos, projetos e credenciais originais preservados."
Write-Output "NÃO HOUVE ATIVAÇÃO: faça teste/rollback e troca controlada antes de reiniciar o worker."
