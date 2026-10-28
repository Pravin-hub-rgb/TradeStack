#!/bin/sh
# TradeStack — start script (Linux / macOS). Requires Docker + docker compose (v2).
set -eu

cd "$(dirname "$0")"

echo "TradeStack — starting containers..."
docker compose up -d

echo "Waiting for backend /health on http://localhost:8001 ..."
i=0
while [ $i -lt 30 ]; do
  if curl -sf -o /dev/null http://localhost:8001/health; then
    echo "Backend is healthy."
    break
  fi
  i=$((i + 1))
  sleep 2
done

echo ""
echo "TradeStack is up:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8001"
echo ""

# Open the browser (try common openers).
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3000
elif command -v open >/dev/null 2>&1; then
  open http://localhost:3000
elif command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c start http://localhost:3000
else
  echo "Open http://localhost:3000 in your browser."
fi

echo ""
echo "Streaming logs.  Ctrl+C to stop streaming (containers keep running)."
echo "To stop the stack:  ./docker-stop.sh"
docker compose logs -f
