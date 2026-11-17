param([Parameter(Mandatory=$true)][string]$InstallDir)
$ErrorActionPreference = 'Stop'
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$runner = Join-Path $InstallDir 'desktop\run-worker.ps1'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw 'MediaForge não encontrado. Nenhuma credencial alterada.' }
$secret = [Console]::In.ReadToEnd()
if ($secret.Length -lt 32 -or $secret.Length -gt 256 -or -not [regex]::IsMatch($secret,'\A[A-Za-z0-9._~+/=-]{32,256}\z')) {
  throw 'Token Worker inválido. Nenhuma credencial alterada.'
}
$secure = ConvertTo-SecureString -String $secret -AsPlainText -Force
$secret = $null
$cipher = ConvertFrom-SecureString -SecureString $secure
$secure = $null
$stateDir = Join-Path $InstallDir '.mediaforge'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$tokenFile = Join-Path $stateDir 'worker-token.dpapi'
$envFile = Join-Path $InstallDir '.env.local'
$suffix = [guid]::NewGuid().ToString('N')
$tmpToken = Join-Path $stateDir ('worker-token-' + $suffix + '.tmp')
$tmpEnv = Join-Path $InstallDir ('.env.local-' + $suffix + '.tmp')
$backupToken = Join-Path $stateDir ('worker-token-backup-' + $suffix + '.dpapi')
$hadToken = Test-Path -LiteralPath $tokenFile -PathType Leaf
$hadEnv = Test-Path -LiteralPath $envFile -PathType Leaf
$oldEnv = if ($hadEnv) { [IO.File]::ReadAllText($envFile) } else { '' }
$installed = $false
try {
  $lines = @($oldEnv -split '\r?\n' | Where-Object { $_ -notmatch '^\s*(MEDIAFORGE_REMOTE_URL|MEDIAFORGE_WORKER_TOKEN)\s*=' -and $_.Length -gt 0 })
  $lines += 'MEDIAFORGE_REMOTE_URL=https://unificmedia.salevo.site'
  [IO.File]::WriteAllText($tmpToken, $cipher, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($tmpEnv, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $tmpToken /inheritance:r /grant:r ('*'+$sid+':(F)') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível restringir o token no Windows.' }
  & icacls.exe $tmpEnv /inheritance:r /grant:r ('*'+$sid+':(F)') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível proteger as configurações no Windows.' }
  if ($hadToken) { Copy-Item -LiteralPath $tokenFile -Destination $backupToken -ErrorAction Stop }
  Move-Item -LiteralPath $tmpToken -Destination $tokenFile -Force -ErrorAction Stop
  Move-Item -LiteralPath $tmpEnv -Destination $envFile -Force -ErrorAction Stop
  $installed = $true
  Write-Output 'CREDENTIAL_STORED'
} finally {
  if (-not $installed) {
    if ($hadToken -and (Test-Path -LiteralPath $backupToken)) {
      Copy-Item -LiteralPath $backupToken -Destination $tokenFile -Force -ErrorAction SilentlyContinue
    } elseif (-not $hadToken) {
      Remove-Item -LiteralPath $tokenFile -Force -ErrorAction SilentlyContinue
    }
    if ($hadEnv) {
      [IO.File]::WriteAllText($envFile, $oldEnv, [Text.UTF8Encoding]::new($false))
    } else {
      Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -LiteralPath $tmpToken,$tmpEnv,$backupToken -Force -ErrorAction SilentlyContinue
  $cipher = $null
  $oldEnv = $null
}
