@echo off
setlocal
title TradeStack
cd /d "%~dp0."

echo Starting TradeStack...
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8001
echo.

set "BUN_DIR="
where bun >nul 2>&1
if %errorlevel% equ 0 set "BUN_DIR=ONPATH"

if defined BUN_DIR goto :bun_ok
if exist "%USERPROFILE%\.bun\bin\bun.exe" set "BUN_DIR=%USERPROFILE%\.bun\bin"
if defined BUN_DIR goto :bun_ok
if exist "C:\Program Files\bun\bin" set "BUN_DIR=C:\Program Files\bun\bin"
if defined BUN_DIR goto :bun_ok
if exist "%LOCALAPPDATA%\bun\bin" set "BUN_DIR=%LOCALAPPDATA%\bun\bin"

:bun_ok
if not defined BUN_DIR goto :no_bun_dir
if "%BUN_DIR%"=="ONPATH" goto :bun_ready
set "PATH=%BUN_DIR%;%PATH%"
:bun_ready
echo bun detected.
goto :after_bun

:no_bun_dir
echo bun not found - will use npm for frontend (node required).

:after_bun
where node >nul 2>&1
if %errorlevel% neq 0 goto :no_node

if exist "backend\venv\Scripts\python.exe" goto :py_ok
where python >nul 2>&1
if %errorlevel% neq 0 goto :no_python
:py_ok
if exist "backend\venv\Scripts\python.exe" echo python venv detected.

echo.
start http://localhost:3000
node dev.js
set "rc=%errorlevel%"
echo.
pause
exit /b %rc%

:no_node
echo ERROR: node.js is required but was not found on PATH.
echo Install Node.js (https://nodejs.org) or Docker Desktop, then retry.
echo.
pause
exit /b 1

:no_python
echo ERROR: Python is required but was not found.
echo Install Python 3.10+ (https://python.org) and create backend\venv, or use Docker.
echo.
pause
exit /b 1
