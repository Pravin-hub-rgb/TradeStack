@echo off
setlocal
title TradeStack (Docker)

echo TradeStack — starting containers...
echo.

docker compose up -d
if %errorlevel% neq 0 (
  echo.
  echo ERROR: docker compose failed to start.
  echo Is Docker Desktop installed and running?
  echo Run "docker version" to check.
  echo.
  pause
  exit /b 1
)

echo.
echo Waiting for backend /health on http://localhost:8001 ...
:waitloop
curl -s -o nul http://localhost:8001/health
if %errorlevel% neq 0 (
  timeout /t 2 /nobreak >nul
  goto :waitloop
)
echo Backend is healthy.

echo.
echo TradeStack is up:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8001
echo.
echo Opening frontend in browser...
start http://localhost:3000
echo.
echo Streaming logs.  Ctrl+C to stop streaming (containers keep running).
echo To stop the stack:  run docker-stop.bat
docker compose logs -f
