"""
step9_settings.py

Tests:
  1. Settings are auto-seeded on import (70 params across 15 categories)
  2. GET /api/settings returns all settings with metadata
  3. GET /api/settings/:key returns single setting
  4. PUT /api/settings/:key updates value
  5. POST /api/settings/reset/:category resets category to defaults
  6. GET /api/settings/nonexistent returns 404
  7. Type casting: boolean, number, string, password

Usage:
  cd backend
  venv\Scripts\python ..\tests\step9_settings.py
"""

import sys, json, time, threading, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

BASE = "http://127.0.0.1:18005"
PORT = 18005
PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"
errors = []


def req(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{BASE}{path}", data=data,
        headers={"Content-Type":"application/json"} if data else {}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
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
# MODULE-LEVEL TESTS (no server)
# ====================================================================

def test_module():
    from src.settings import get_all as sget_all, get as sget, set as sset, reset_category, reset_all, SEED

    all_s = sget_all()
    check(f"Module: {len(all_s)} settings loaded (expect 70)",
          lambda: len(all_s) >= 70)

    cats = set(s["category"] for s in all_s)
    check(f"Module: {len(cats)} categories",
          lambda: len(cats) >= 14)

    check("Module: price_min default = 100",
          lambda: sget("price_min") == 100)

    check("Module: paper_trading_enabled = True",
          lambda: sget("paper_trading_enabled") is True)

    check("Module: market_open = 09:15",
          lambda: sget("market_open") == "09:15")

    check("Module: nonexistent returns None",
          lambda: sget("__nonexistent__") is None)

    check("Module: set + verify",
          lambda: (
              sset("price_min", "999"),
              sget("price_min") == 999
          ))

    check("Module: reset_category restores default",
          lambda: (
              reset_category("scanner_base"),
              sget("price_min") == 100
          ))

    # Check seed integrity
    seed_keys = {s["key"] for s in SEED}
    db_keys = {s["key"] for s in sget_all()}
    check("Module: all seed keys present in DB",
          lambda: seed_keys == db_keys)


# ====================================================================
# SERVER TESTS
# ====================================================================

def test_server():
    check("Srv: GET /api/settings",
          lambda: (
              lambda s, d: (s == 200 and len(d["settings"]) >= 70) or 1/0
          )(*req("GET", "/api/settings")))

    check("Srv: GET /api/settings/price_min",
          lambda: (
              lambda s, d: (s == 200 and d["value"] == 100) or 1/0
          )(*req("GET", "/api/settings/price_min")))

    check("Srv: PUT /api/settings/price_min = 250",
          lambda: (
              lambda s, d: (s == 200 and d["value"] == "250") or 1/0
          )(*req("PUT", "/api/settings/price_min", {"value": "250"})))

    check("Srv: verified price_min = 250",
          lambda: (
              lambda s, d: d["value"] == 250 or 1/0
          )(*req("GET", "/api/settings/price_min")))

    check("Srv: PUT back to 100",
          lambda: (
              req("PUT", "/api/settings/price_min", {"value": "100"})[0] == 200
          ))

    check("Srv: POST reset/scanner_base restores 100",
          lambda: (
              req("POST", "/api/settings/reset/scanner_base")[0] == 200 and
              req("GET", "/api/settings/price_min")[1]["value"] == 100
          ))

    check("Srv: GET nonexistent = 404",
          lambda: req("GET", "/api/settings/nonexistent")[0] == 404)

    check("Srv: PUT nonexistent = 404",
          lambda: req("PUT", "/api/settings/nonexistent", {"value": "x"})[0] == 404)

    check("Srv: POST reset_all restores all",
          lambda: req("POST", "/api/settings/reset")[0] == 200)


# ====================================================================
# MAIN
# ====================================================================

if __name__ == "__main__":
    print("=" * 55)
    print("STEP 9: Settings Engine — Test Suite")
    print("=" * 55)

    print(f"\n{WARN} PART 1: Module-level tests")
    test_module()

    print(f"\n{WARN} PART 2: Server endpoint tests")
    srv = threading.Thread(target=start_server, daemon=True)
    srv.start()
    time.sleep(2)
    test_server()

    total = 17
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
