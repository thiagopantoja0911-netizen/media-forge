@echo off
setlocal
echo =====================================================
echo   MEDIAFORGE - ATUALIZAR WORKER E REPROCESSAR VIDEOS
echo =====================================================
echo.
echo Baixando os scripts oficiais do repositorio...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $d=Join-Path $env:TEMP ('MediaForge-Update-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $d -Force | Out-Null; try { $base='https://raw.githubusercontent.com/thiagopantoja0911-netizen/media-forge/fix/mediaforge-render-resilience-20261118/desktop'; Invoke-WebRequest -Uri ($base+'/update-and-retry.ps1') -OutFile (Join-Path $d 'update-and-retry.ps1') -UseBasicParsing; Invoke-WebRequest -Uri ($base+'/update-worker-auto.ps1') -OutFile (Join-Path $d 'update-worker-auto.ps1') -UseBasicParsing; & (Join-Path $d 'update-and-retry.ps1'); if (-not $?) { throw 'Atualizacao ou reenvio nao concluido.' } } finally { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }"
if errorlevel 1 (
  echo.
  echo OPERACAO INTERROMPIDA.
  echo Verifique se a publicacao do servidor foi concluida e tente novamente.
  echo Nenhum projeto ou credencial foi apagado.
  pause
  exit /b 1
)
echo.
echo Atualizacao e reenvio solicitados. Acompanhe:
echo https://unificmedia.salevo.site/health
echo.
pause
exit /b 0
