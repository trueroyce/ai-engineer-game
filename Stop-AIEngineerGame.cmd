@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-AIEngineerGame.ps1" %*
set "launcherExit=%errorlevel%"
if errorlevel 1 (
  echo.
  echo Stop failed. The launcher refused to stop an unverified process.
  pause >nul
)
endlocal & exit /b %launcherExit%
