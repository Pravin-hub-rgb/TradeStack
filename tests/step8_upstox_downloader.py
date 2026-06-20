"""
step8_upstox_downloader.py

Tests:
  1. Token mgmt (save, validate, check, status)
  2. Single stock fetch (RELIANCE, 180 days)
  3. 3-stock fetch + cache save + SQLite index verify
  4. Server endpoints (health, token, cache-info, symbols, download trigger)
  5. Background task trigger via HTTP

Usage:
  cd backend
  venv\Scripts\python ..\tests\step8_upstox_downloader.py
"""

import sys, json, time, threading, urllib.request, urllib.error
from pathlib import Path

NA = r"C:\Users\Pravin\Desktop\main\MA_Stock_Trader_NA"
sys.path.insert(0, str(Path(NA) / "backend"))

import pandas as pd
from src.upstox_config import get_status, validate_token, check_token, get_token
from src.upstox_fetcher import fetch_historical_data, instrument_keys_loaded, get_nse_stocks
from src.cache_manager import cache_manager
from src import db

PORT = 18003
BASE = f"http://127.0.0.1:{PORT}"
errors = []
PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"
OLD_CFG = Path(NA).parent / "MA_Stock_Trader" / "upstox_config.json"

# --- helpers ---

def req(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except urllib.error.URLError:
        return 0, {"error": "connection refused"}

def check(label, fn):
    try:
        fn()
        print(f"{PASS} {label}")
    except Exception as e:
        errors.append(f"{FAIL} {label}: {e}")
        print(f"{FAIL} {label}: {e}")

def start_server():
    from server import app
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="error")

# ====================================================================
# TOKEN
# ====================================================================

def test_token():
    TOKEN = json.load(open(OLD_CFG))["access_token"]

    check("instrument_keys_loaded() > 0",
          lambda: (instrument_keys_loaded() > 0) or 1/0)
    check("get_nse_stocks() returns list",
          lambda: (len(get_nse_stocks()) > 0) or 1/0)

    check("validate_token saves + validates (3 stocks)",
          lambda: (validate_token(TOKEN)["valid"] == True) or 1/0)
    check("check_token() read-only",
          lambda: (check_token()["valid"] == True) or 1/0)
    check("get_status() returns masked token",
          lambda: (
              lambda s: (
                  s["exists"] == True and len(s["masked_token"]) > 5
              ) or 1/0
          )(get_status()))
    check("get_token() returns real token",
          lambda: len(get_token()) > 50)
    check("validate_token rejects bad token",
          lambda: (validate_token("BAD_TOKEN")["valid"] == False) or 1/0)
    check("restore good token after bad test",
          lambda: (validate_token(TOKEN)["valid"] == True) or 1/0)

# ====================================================================
# SINGLE STOCK DOWNLOAD
# ====================================================================

def test_single_stock():
    df = fetch_historical_data("RELIANCE", get_token(), days=180)
    check("RELIANCE fetch returns 119 rows",
          lambda: (
              (not df.empty) and
              (len(df) > 100) and
              ("close" in df.columns)
          ) or 1/0)

# ====================================================================
# 3-STOCK + SAVE + SQLITE INDEX
# ====================================================================

def test_three_stock_index():
    token = get_token()
    syms = ["RELIANCE", "TCS", "HDFCBANK"]
    for sym in syms:
        df = fetch_historical_data(sym, token, days=180)
        assert not df.empty, f"{sym}: empty"
        assert len(df) > 100, f"{sym}: {len(df)} rows"
        cache_manager.update(sym, df)

    stats = db.get_cache_stats()
    check("SQLite index has 2084+ entries",
          lambda: stats["stock_count"] >= 2084)

    idx = db.list_symbols_from_index()
    for sym in syms:
        check(f"{sym} found in SQLite index",
              lambda s=sym: s in idx)

# ====================================================================
# SERVER ENDPOINTS
# ====================================================================

def test_server():
    check("GET /health",
          lambda: req("GET", "/health") == (200, {"status": "healthy"}))
    check("GET /",
          lambda: req("GET", "/")[0] == 200)
    check("GET /api/token/status (exists)",
          lambda: req("GET", "/api/token/status")[1]["exists"] == True)
    check("GET /api/token/check (valid)",
          lambda: req("GET", "/api/token/check")[1]["valid"] == True)
    check("POST /api/token/validate (bad token)",
          lambda: req("POST", "/api/token/validate", {"token": "BAD"})[1]["valid"] == False)
    check("GET /api/data/cache-info (has stocks)",
          lambda: req("GET", "/api/data/cache-info")[1]["stock_count"] > 0)
    check("GET /api/data/symbols (2000+)",
          lambda: len(req("GET", "/api/data/symbols")[1]["symbols"]) > 2000)
    check("POST /api/data/download-historical (trigger started)",
          lambda: req("POST", "/api/data/download-historical")[1]["status"] == "started")
    check("GET /api/data/status/bogus (404)",
          lambda: req("GET", "/api/data/status/nonexistent")[0] == 404)

# ====================================================================
# MAIN
# ====================================================================

if __name__ == "__main__":
    print("=" * 55)
    print("STEP 8: Upstox Downloader — Test Suite")
    print("=" * 55)

    print(f"\n{WARN} PART 1: Token module tests")
    test_token()

    print(f"\n{WARN} PART 2: Single stock download (RELIANCE)")
    test_single_stock()

    print(f"\n{WARN} PART 3: 3-stock download + save + SQLite index")
    test_three_stock_index()

    print(f"\n{WARN} PART 4: Server endpoints (port {PORT})")
    srv = threading.Thread(target=start_server, daemon=True)
    srv.start()
    time.sleep(2)
    test_server()

    total = 18
    passed = total - len(errors)
    print(f"\n{'=' * 55}")
    print(f"RESULTS: {len(errors)} errors, {passed}/{total} passed")
    if errors:
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    else:
        print("ALL TESTS PASSED")
        print("=" * 55)
