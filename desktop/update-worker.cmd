@echo off
setlocal
set "INSTALL_DIR=%LOCALAPPDATA%\MediaForge-Staging"
set "UPDATER=%INSTALL_DIR%\desktop\update-worker-safe.ps1"

echo ================================================
echo   MEDIAFORGE - ATUALIZACAO SEGURA DO WORKER
echo ================================================
echo.
if not exist "%UPDATER%" (
  echo ERRO: Instalacao MediaForge nao encontrada em:
  echo %INSTALL_DIR%
  echo.
  echo Nenhum arquivo foi alterado.
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%UPDATER%" -InstallDir "%INSTALL_DIR%"
if errorlevel 1 (
  echo.
  echo FALHA NA ATUALIZACAO. Credenciais e projetos foram preservados.
  pause
  exit /b 1
)
echo.
echo Worker atualizado e reiniciado quando a tarefa agendada existe.
echo Verifique o status em https://unificmedia.salevo.site/health
echo.
pause
exit /b 0
