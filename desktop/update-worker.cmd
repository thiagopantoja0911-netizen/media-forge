@echo off
setlocal
set "UPDATER=%~dp0update-worker-auto.ps1"

echo ================================================
echo   MEDIAFORGE - ATUALIZACAO SEGURA DO WORKER
echo ================================================
echo.
if not exist "%UPDATER%" (
  echo ERRO: Coloque este CMD ao lado de update-worker-auto.ps1.
  echo Os dois arquivos estao disponiveis na pasta desktop do repositorio.
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%UPDATER%"
if errorlevel 1 (
  echo.
  echo FALHA NA ATUALIZACAO. Nenhuma limpeza de projetos ou credenciais foi executada.
  pause
  exit /b 1
)
echo.
echo Atualizacao concluida. Confirme o Worker online antes de renderizar.
echo https://unificmedia.salevo.site/health
echo.
pause
exit /b 0
