@echo off
setlocal
call "%~dp0Start-AIEngineerGame.cmd" -NoBrowser
if errorlevel 1 (
  endlocal
  exit /b 1
)
start "" "http://127.0.0.1:8091/classic.html"
endlocal & exit /b 0
