param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$ServerUrl = "https://mediaforge.salevo.site"
)
$ErrorActionPreference="Stop"
$InstallDir=[IO.Path]::GetFullPath($InstallDir)
if(-not(Test-Path -LiteralPath $InstallDir -PathType Container)){throw "MediaForge não instalado no diretório escolhido."}
if($ServerUrl -notmatch '^https://mediaforge\.salevo\.site$'){throw "A URL do servidor deve ser o MediaForge oficial HTTPS."}
$secure=Read-Host "Cole o NOVO token Worker MediaForge (entrada oculta, nunca envie no chat)" -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if($token.Length -lt 32){throw "Token inválido. Valor não salvo."}
# Ensure the newly rotated token authenticates without claiming jobs or changing
# the heartbeat BEFORE touching any existing working Windows service.
try {
  $headers=@{Authorization="Bearer $token"}
  $response=Invoke-WebRequest -Uri ($ServerUrl+"/v1/worker/auth-check") -Method POST -ContentType 'application/json' -Headers $headers -Body '{}' -UseBasicParsing -TimeoutSec 12
  $data=$response.Content | ConvertFrom-Json
  if($response.StatusCode -ne 200 -or $data.ok -ne $true -or $data.authenticated -ne $true){throw "TOKEN_PREFLIGHT_FAILED"}
} catch {
  Remove-Variable -Name token,headers -ErrorAction SilentlyContinue
  throw "Falha ao validar token no servidor; instalação existente não foi modificada."
}
Remove-Variable -Name token,headers -ErrorAction SilentlyContinue
$stateDir=Join-Path $InstallDir ".mediaforge"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$tokenPath=Join-Path $stateDir "worker-token.dpapi"
$tmp=Join-Path $stateDir ("worker-token-"+[guid]::NewGuid().ToString("N")+".tmp")
$previous=Join-Path $stateDir ("worker-token-backup-"+[guid]::NewGuid().ToString("N")+".dpapi")
$envPath=Join-Path $InstallDir ".env.local"
$envTemp=Join-Path $InstallDir (".env.local-"+[guid]::NewGuid().ToString("N")+".tmp")
$hadToken=Test-Path -LiteralPath $tokenPath -PathType Leaf
$hadEnv=Test-Path -LiteralPath $envPath -PathType Leaf
$envBackup=Join-Path $stateDir ("env-backup-"+[guid]::NewGuid().ToString("N")+".tmp")
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$installed=$false
try {
  if($hadToken){Copy-Item -LiteralPath $tokenPath -Destination $previous -ErrorAction Stop}
  if($hadEnv){Copy-Item -LiteralPath $envPath -Destination $envBackup -ErrorAction Stop}
  # Encrypt with Windows DPAPI bound to the currently logged-in Windows user.
  $cipher=$secure | ConvertFrom-SecureString
  [IO.File]::WriteAllText($tmp,$cipher,(New-Object Text.UTF8Encoding($false)))
  & icacls $tmp /inheritance:r /grant:r ('*'+$sid+':(F)') | Out-Null
  if($LASTEXITCODE -ne 0){throw "Permissões de token não puderam ser restringidas."}
  # Keep .env.local free of long-lived credentials. Preserve other settings.
  $lines=if($hadEnv){@(Get-Content -LiteralPath $envPath -ErrorAction Stop |
    Where-Object {$_ -notmatch '^\s*(MEDIAFORGE_REMOTE_URL|MEDIAFORGE_WORKER_TOKEN)\s*='})}else{@()}
  $lines+=("MEDIAFORGE_REMOTE_URL="+$ServerUrl)
  [IO.File]::WriteAllLines($envTemp,[string[]]$lines,(New-Object Text.UTF8Encoding($false)))
  & icacls $envTemp /inheritance:r /grant:r ('*'+$sid+':(F)') | Out-Null
  if($LASTEXITCODE -ne 0){throw "Permissões do .env.local não puderam ser restringidas."}
  Move-Item -LiteralPath $tmp -Destination $tokenPath -Force -ErrorAction Stop
  Move-Item -LiteralPath $envTemp -Destination $envPath -Force -ErrorAction Stop
  # Restart only after new credential is safely persisted and prevalidated.
  & (Join-Path $PSScriptRoot "start-worker-background.ps1") -InstallDir $InstallDir
  if($LASTEXITCODE -ne 0){throw "Tarefa de segundo plano não reiniciou."}
  $installed=$true
  Write-Output "Credencial DPAPI validada; worker reiniciado. Token não foi registrado em arquivo texto."
} finally {
  if(-not $installed) {
    if($hadToken -and (Test-Path -LiteralPath $previous)){Copy-Item -LiteralPath $previous -Destination $tokenPath -Force -ErrorAction SilentlyContinue}
    elseif(-not $hadToken){Remove-Item -LiteralPath $tokenPath -Force -ErrorAction SilentlyContinue}
    if($hadEnv -and (Test-Path -LiteralPath $envBackup)){Copy-Item -LiteralPath $envBackup -Destination $envPath -Force -ErrorAction SilentlyContinue}
    elseif(-not $hadEnv){Remove-Item -LiteralPath $envPath -Force -ErrorAction SilentlyContinue}
  }
  foreach($item in @($tmp,$previous,$envTemp,$envBackup)){Remove-Item -LiteralPath $item -Force -ErrorAction SilentlyContinue}
}
