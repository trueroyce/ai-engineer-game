@echo off
setlocal
call "%~dp0Start-AIEngineerGame.cmd" -NoBrowser
if errorlevel 1 exit /b 1
start "" "http://127.0.0.1:8091/classic.html"
endlocal
