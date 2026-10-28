#!/bin/sh
# TradeStack — stop script (Linux / macOS).
set -eu

cd "$(dirname "$0")"

docker compose down
echo "Containers stopped."
