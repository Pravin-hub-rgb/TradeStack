#!/usr/bin/env bash
# TradeStack one-shot setup for Linux/macOS.
# Installs Node + Python dependencies, seeds the database, verifies runtime data.
set -euo pipefail
cd "$(dirname "$0")"

cyan=$'\033[36m'; green=$'\033[32m'; yellow=$'\033[33m'; red=$'\033[31m'; nc=$'\033[0m'
echo "==> TradeStack setup (repo: $(pwd))"

# --- 1. Prerequisites -------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
    echo "    bun not found — install it first:  curl -fsSL https://bun.sh/install | bash" >&2
    exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
    echo "    Python 3.x not found — install it from https://www.python.org/downloads/" >&2
    exit 1
fi
echo "==> $(bun --version) / $(python3 --version)"

# --- 2. Node dependencies ---------------------------------------------------
echo "==> bun install (root)"
bun install
echo "==> bun install (frontend)"
(cd frontend && bun install)

# --- 3. Python venv + dependencies ------------------------------------------
if [ ! -d backend/venv ]; then
    echo "==> Creating backend venv"
    python3 -m venv backend/venv
fi
echo "==> pip install -r backend/requirements.txt"
backend/venv/bin/python -m pip install -q -r backend/requirements.txt

# --- 4. Seed database (schema + settings + cache index) ---------------------
echo "==> Seeding SQLite (settings) + rebuilding cache index"
backend/venv/bin/python backend/seed_db.py

# --- 5. Runtime data checks --------------------------------------------------
if [ -f data/NSE.json.gz ]; then
    echo "==> data/NSE.json.gz present (instrument key source)"
else
    echo ""
    echo "    WARNING: data/NSE.json.gz is MISSING."
    echo "    This file (compressed NSE instrument map) is required for the live trader"
    echo "    and instrument-key resolution. Copy it from your other TradeStack install"
    echo "    into data/NSE.json.gz, or download from Upstox and gzip NSE.json into place."
fi

echo ""
echo "Setup complete."
echo "Next:"
echo "  1. (optional) copy frontend/.env.example to frontend/.env.local"
echo "  2. bun run dev               # starts Next.js :3000 + FastAPI :8001"
echo "  3. open http://localhost:3000 -> Scanner -> Cache Data to update data"
echo "     (needs your Upstox token via Live Trading -> Token first time)"
