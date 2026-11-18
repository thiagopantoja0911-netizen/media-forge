@echo off
setlocal
set "RUNNER=%~dp0update-and-retry.ps1"

echo =====================================================
echo   MEDIAFORGE - ATUALIZAR WORKER E REPROCESSAR VIDEOS
echo =====================================================
echo.
if not exist "%RUNNER%" (
  echo ERRO: Coloque update-and-retry.ps1 e update-worker-auto.ps1
  echo na mesma pasta deste CMD.
  echo Os arquivos estao na pasta desktop do repositorio MediaForge.
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RUNNER%"
if errorlevel 1 (
  echo.
  echo OPERACAO INTERROMPIDA.
  echo Verifique a publicacao do servidor e a conexao do Worker.
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
