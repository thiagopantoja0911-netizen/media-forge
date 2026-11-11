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
$envPath=Join-Path $InstallDir ".env.local"
$lines=if(Test-Path $envPath){@(Get-Content -LiteralPath $envPath)}else{@()}
$lines=@($lines | Where-Object {$_ -notmatch '^(MEDIAFORGE_REMOTE_URL|MEDIAFORGE_WORKER_TOKEN)='})
$lines+=@("MEDIAFORGE_REMOTE_URL=$ServerUrl","MEDIAFORGE_WORKER_TOKEN=$token")
$lines | Set-Content -LiteralPath $envPath -Encoding utf8
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls $envPath /inheritance:r /grant:r ('*'+$sid+':(F)') | Out-Null
Remove-Variable token
Write-Host "Conexão remota configurada. Inicie: powershell -ExecutionPolicy Bypass -File .\desktop\run-worker.ps1 -InstallDir '$InstallDir'"
Write-Host "Mantenha o worker antigo Salevo em funcionamento durante os testes."
