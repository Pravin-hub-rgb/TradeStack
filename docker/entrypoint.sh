#!/bin/sh
# ====================================================================
# TradeStack backend entrypoint.
#
# The container's /app/data is bind-mounted from the host ./data volume.
# On a fresh clone that volume carries data/NSE.json.gz (tracked in git).
# On an image-imported PC (docker load -> docker compose up) the volume is
# empty, so restore the bundled instrument map from /app/instruments.
# ====================================================================
set -e

if [ ! -f /app/data/NSE.json.gz ] && [ -f /app/instruments/NSE.json.gz ]; then
  mkdir -p /app/data
  cp /app/instruments/NSE.json.gz /app/data/NSE.json.gz
  echo "[entrypoint] restored NSE.json.gz into /app/data (fresh volume detected)"
fi

exec "$@"
