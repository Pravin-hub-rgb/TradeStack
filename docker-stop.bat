@echo off
title TradeStack — Stop

echo TradeStack — stopping containers...
docker compose down
if %errorlevel% neq 0 (
  echo ERROR: docker compose could not stop. Is the stack running?
  pause
  exit /b 1
)
echo Containers stopped.
pause
