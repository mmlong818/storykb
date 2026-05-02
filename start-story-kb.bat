@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE=%~dp0runtime\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

start "Story KB Database Server" /min "%NODE_EXE%" "runtime\local-server.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5178/"
endlocal
