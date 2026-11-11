param(
  [string]$InstallDir = "$env:LOCALAPPDATA\MediaForge-Staging",
  [string]$ServerUrl = "https://mediaforge.salevo.site"
)
$ErrorActionPreference="Stop"
if(-not(Test-Path -LiteralPath $InstallDir)){throw "Instale primeiro o worker MediaForge no diretório: $InstallDir"}
if($ServerUrl -notmatch '^https://[a-z0-9.-]+(?::443)?$'){throw "A URL deve utilizar HTTPS e não pode conter caminhos"}
$secure=Read-Host "Insira o token do Worker MediaForge (o texto fica oculto)" -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if($token.Length -lt 32){throw "Token inválido. O token deve conter pelo menos 32 caracteres"}
Add-Type -AssemblyName System.Security
$tokenBytes=[Text.Encoding]::UTF8.GetBytes($token)
try {
  $protected=[Security.Cryptography.ProtectedData]::Protect($tokenBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $tokenPath=Join-Path $InstallDir ".worker-token.dpapi"
  [IO.File]::WriteAllBytes($tokenPath,$protected)
} finally {
  [Array]::Clear($tokenBytes,0,$tokenBytes.Length)
}
$envPath=Join-Path $InstallDir ".env.local"
$lines=if(Test-Path $envPath){@(Get-Content -LiteralPath $envPath | Where-Object {$_ -notmatch '^(MEDIAFORGE_REMOTE_URL|MEDIAFORGE_WORKER_TOKEN)='})}else{@()}
$lines+=@("MEDIAFORGE_REMOTE_URL=$ServerUrl")
[IO.File]::WriteAllLines($envPath,[string[]]$lines,([Text.UTF8Encoding]::new($false)))
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls $envPath /inheritance:r /grant:r ('*'+$sid+':(F)') | Out-Null
if($LASTEXITCODE -ne 0){throw "Não foi possível restringir as permissões do arquivo de conexão."}
& icacls $tokenPath /inheritance:r /grant:r ('*'+$sid+':(F)') | Out-Null
if($LASTEXITCODE -ne 0){throw "Não foi possível restringir as permissões do token DPAPI."}
Remove-Variable token
& (Join-Path $PSScriptRoot "start-worker-background.ps1") -InstallDir $InstallDir
