@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-AIEngineerGame.ps1" %*
set "launcherExit=%errorlevel%"
if errorlevel 1 (
  echo.
  echo Launch failed. Review the PowerShell error above. Press any key to close.
  pause >nul
)
endlocal & exit /b %launcherExit%
