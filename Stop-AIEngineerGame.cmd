@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-AIEngineerGame.ps1" %*
if errorlevel 1 (
  echo.
  echo 停止失敗。為避免關掉無關程序，啟動器已拒絕操作。
  pause >nul
)
endlocal

