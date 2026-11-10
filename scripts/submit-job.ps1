param(
  [Parameter(Mandatory = $true)]
  [string]$Prompt,
  [string]$ProjectDir = ".mediaforge\\hf-smoke",
  [string]$OutputName = "mediaforge-video.mp4"
)

$indexPath = Join-Path $ProjectDir "index.html"
if (-not (Test-Path -LiteralPath $indexPath)) {
  throw "Projeto não encontrado: $indexPath"
}

$body = @{
  prompt = $Prompt
  project = @{
    title = "MediaForge job"
    durationSeconds = 10
    aspectRatio = "16:9"
    outputs = @("video")
    renderer = "hyperframes"
    outputName = $OutputName
  }
  projectFiles = @(
    @{
      path = "index.html"
      content = Get-Content -LiteralPath $indexPath -Raw
    }
  )
} | ConvertTo-Json -Depth 20

$created = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8787/v1/jobs" `
  -ContentType "application/json" `
  -Body $body

$jobId = $created.job.id
Write-Host "Job enviado: $jobId"

do {
  Start-Sleep -Seconds 2
  $current = Invoke-RestMethod -Method Get -Uri ("http://127.0.0.1:8787/v1/jobs/" + $jobId)
  $progress = if ($null -eq $current.job.progress) { 0 } else { $current.job.progress }
  Write-Host ("Status: " + $current.job.status + " | progresso: " + $progress + "%")
} while ($current.job.status -in @("queued", "processing"))

if ($current.job.status -eq "completed") {
  Write-Host "Concluído."
  $current.job.result | ConvertTo-Json -Depth 20
} else {
  Write-Error ($current.job.error | ConvertTo-Json -Depth 20)
  exit 1
}
