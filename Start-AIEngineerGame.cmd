@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-AIEngineerGame.ps1" %*
if errorlevel 1 (
  echo.
  echo 啟動失敗。請閱讀上方原因；這個視窗會保留到你按任意鍵。
  pause >nul
)
endlocal
