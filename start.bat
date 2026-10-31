@echo off
setlocal
title TradeStack
cd /d "%~dp0"

echo Starting TradeStack...
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8001
echo.

where bun >nul 2>&1
if %errorlevel% neq 0 goto :no_bun

echo bun detected - starting native dev servers (bun run dev).
echo.
start http://localhost:3000
bun run dev
set "rc=%errorlevel%"
echo.
pause
exit /b %rc%

:no_bun
echo bun not found on PATH - native dev mode needs bun.
echo Falling back to Docker (no bun/node/python required)...
echo.

where docker >nul 2>&1
if %errorlevel% neq 0 goto :no_docker

docker compose up -d
if %errorlevel% neq 0 goto :compose_failed

:waithealth
curl -s -o nul http://localhost:8001/health
if %errorlevel% neq 0 (
  timeout /t 2 /nobreak >nul
  goto :waithealth
)

echo.
echo TradeStack is up:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8001
echo Opening frontend in browser...
start http://localhost:3000
echo.
echo Containers are running in the background (detached).
echo To stop the stack: run docker-stop.bat
pause
exit /b 0

:compose_failed
echo.
echo ERROR: docker compose failed to start.
echo Is Docker Desktop running? Check the Docker tray icon next to the clock.
echo.
pause
exit /b 1

:no_docker
echo ERROR: Neither bun nor Docker was found.
echo Install Docker Desktop (https://docker.com) or bun (https://bun.sh), then retry.
echo.
pause
exit /b 1
