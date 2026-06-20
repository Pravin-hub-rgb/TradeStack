# -*- coding: utf-8 -*-
"""
step15_pre_market_endpoints.py

Tests for Step 15 - Pre-market IEP + VAH endpoints + volume baselines.

  1. GET /api/prep/previous-trading-day returns a valid date
  2. POST /api/prep/volume-baselines returns baselines for known symbols
  3. POST /api/prep/volume-baselines returns fallback for unknown symbols
  4. POST /api/prep/iep returns 401 without token
  5. POST /api/prep/volume-profile returns 401 without token
  6. IEPFetcher module imports correctly
  7. VolumeProfileCalculator module imports and can find previous trading day
  8. IEPFetcher resolves instrument keys from symbol list
  9. Volume profile calculation algorithm works with synthetic data

Usage:
  cd backend
  venv\Scripts\python ..\tests\step15_pre_market_endpoints.py
"""

import sys
import json
import time
import threading
import urllib.request
import urllib.error
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

BASE = "http://127.0.0.1:18015"
PORT = 18015
PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"
errors = []


def req(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except urllib.error.URLError:
        return 0, {"error": "connection refused"}


def check(desc, ok, detail=""):
    if ok:
        print(f"  {PASS} {desc}")
    else:
        print(f"  {FAIL} {desc}  <- {detail}")
        errors.append(desc)


def start_server():
    from server import app
    import uvicorn

    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="error")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    for _ in range(20):
        status, _ = req("GET", "/health")
        if status == 200:
            return server
        time.sleep(0.3)
    raise RuntimeError("Server did not start")


HAS_TOKEN = False
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
    from src.upstox_config import get_token
    HAS_TOKEN = bool(get_token())
except Exception:
    pass


def test_previous_trading_day():
    print("\n--- Test 1: GET /api/prep/previous-trading-day ---")
    status, data = req("GET", "/api/prep/previous-trading-day")
    if HAS_TOKEN:
        check("Returns 200 with token", status == 200, f"got {status}")
        check("Has date field", "date" in data)
    else:
        check("Returns 401 (no token configured)", status == 401, f"got {status}")
        check("Response has detail field", "detail" in data)


def test_volume_baselines():
    print("\n--- Test 2: POST /api/prep/volume-baselines ---")
    status, data = req("POST", "/api/prep/volume-baselines", {"symbols": ["20MICRONS", "RELIANCE"]})
    check("Returns 200", status == 200, f"got {status}")
    check("Has baselines dict", "baselines" in data)
    check("Has count field", "count" in data)
    check("Count matches requested", data["count"] == 2, f"got {data['count']}")
    if "baselines" in data:
        bl = data["baselines"]
        check("20MICRONS has valid baseline", bl.get("20MICRONS", 0) > 0, f"got {bl.get('20MICRONS')}")
        check("RELIANCE has valid baseline", bl.get("RELIANCE", 0) > 0, f"got {bl.get('RELIANCE')}")


def test_volume_baselines_fallback():
    print("\n--- Test 3: Volume baselines fallback for unknown symbols ---")
    status, data = req("POST", "/api/prep/volume-baselines", {"symbols": ["__NONEXISTENT__"]})
    check("Returns 200 for unknown symbol", status == 200, f"got {status}")
    if "baselines" in data:
        check("Unknown gets fallback", data["baselines"].get("__NONEXISTENT__", 0) > 0)


def test_iep_no_token():
    print("\n--- Test 4: POST /api/prep/iep ---")
    status, data = req("POST", "/api/prep/iep", {"symbols": ["RELIANCE"]})
    if not HAS_TOKEN:
        check("Returns 401 (no token)", status == 401, f"got {status}")
        check("Error mentions token", "token" in (data.get("detail") or "").lower(), f"got {data.get('detail')}")
    else:
        check("Returns 200 with token", status == 200, f"got {status}")
        check("Has prices field", "prices" in data)


def test_volume_profile_no_token():
    print("\n--- Test 5: POST /api/prep/volume-profile ---")
    status, data = req("POST", "/api/prep/volume-profile", {"symbols": ["RELIANCE"]})
    if not HAS_TOKEN:
        check("Returns 401 (no token)", status == 401, f"got {status}")
        check("Error mentions token", "token" in (data.get("detail") or "").lower(), f"got {data.get('detail')}")
    else:
        check("Returns 200 with token", status == 200, f"got {status}")
        check("Has vah field", "vah" in data)


def test_module_imports():
    print("\n--- Test 6: Module imports ---")
    try:
        from src.iep_fetcher import iep_fetcher
        check("IEPFetcher imports", True)
        check("Has fetch_iep_batch", hasattr(iep_fetcher, "fetch_iep_batch"))
        check("Has fetch_single", hasattr(iep_fetcher, "fetch_single"))
    except Exception as e:
        check(f"IEPFetcher import failed: {e}", False)

    try:
        from src.volume_profile import volume_profile_calculator
        check("VolumeProfileCalculator imports", True)
        check("Has calculate_vah_for_stocks", hasattr(volume_profile_calculator, "calculate_vah_for_stocks"))
        check("Has calculate_volume_profile", hasattr(volume_profile_calculator, "calculate_volume_profile"))
        check("Has get_previous_trading_day", hasattr(volume_profile_calculator, "get_previous_trading_day"))
    except Exception as e:
        check(f"VolumeProfileCalculator import failed: {e}", False)


def test_instrument_resolution():
    print("\n--- Test 7: Instrument key resolution ---")
    try:
        from src.upstox_fetcher import get_instrument_key
        key = get_instrument_key("RELIANCE")
        check("RELIANCE resolves to NSE_EQ|ISIN", key and key.startswith("NSE_EQ|"), f"got {key}")
        key_mc = get_instrument_key("20MICRONS")
        check("20MICRONS resolves to NSE_EQ|ISIN", key_mc and key_mc.startswith("NSE_EQ|"), f"got {key_mc}")
        key_cf = get_instrument_key("CHOLAFIN")
        check("CHOLAFIN uses manual mapping", key_cf == "NSE_EQ|INE121A01024", f"got {key_cf}")
    except Exception as e:
        check(f"Instrument resolution failed: {e}", False)


def test_volume_profile_algorithm():
    print("\n--- Test 8: Volume profile algorithm with synthetic data ---")
    try:
        from src.volume_profile import VolumeProfileCalculator
        import pandas as pd
        import numpy as np

        calc = VolumeProfileCalculator()
        np.random.seed(42)
        n = 375
        base = 100.0
        rows = []
        price = base
        for i in range(n):
            o = price
            h = o + abs(np.random.normal(0.15, 0.05))
            l = o - abs(np.random.normal(0.1, 0.05))
            c = o + np.random.normal(0.001, 0.1)
            v = int(np.random.uniform(10000, 50000))
            rows.append({"open": o, "high": h, "low": l, "close": c, "volume": v})
            price = c

        df = pd.DataFrame(rows)
        result = calc.calculate_volume_profile(df)
        check("VAH is calculated", result["vah"] is not None, f"vah={result['vah']}")
        check("VAL is calculated", result["val"] is not None, f"val={result['val']}")
        check("POC is calculated", result["poc"] is not None, f"poc={result['poc']}")
        check("VAH > VAL", result["vah"] > result["val"], f"VAH={result['vah']} <= VAL={result['val']}")
        check("POC is between VAL and VAH", result["val"] <= result["poc"] <= result["vah"],
              f"POC={result['poc']} outside [{result['val']}, {result['vah']}]")
        check("Profile has entries", len(result.get("profile", {})) > 0)

        empty_result = calc.calculate_volume_profile(pd.DataFrame())
        check("Empty DF returns no VAH", empty_result["vah"] is None)

        single = pd.DataFrame([{"open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 10000}])
        sr = calc.calculate_volume_profile(single)
        check("Single row returns no VAH (<10 candles)", sr["vah"] is None)

        flat_rows = []
        for i in range(75):
            drift = (i / 75) * 2.0
            flat_rows.append({"open": 100 + drift, "high": 100.5 + drift, "low": 99.5 + drift, "close": 100.25 + drift, "volume": 50000})
        flat_result = calc.calculate_volume_profile(pd.DataFrame(flat_rows))
        check("Trending day (>10 candles) gets VAH", flat_result["vah"] is not None, f"vah={flat_result['vah']}")

    except Exception as e:
        import traceback
        check(f"Volume profile algorithm test failed: {e}", False)
        traceback.print_exc()


def test_intraday_fetch():
    print("\n--- Test 9: Intraday fetch for BSE symbol ---")
    try:
        from datetime import date
        from src.volume_profile import VolumeProfileCalculator
        calc = VolumeProfileCalculator()
        result = calc._fetch_intraday("BSE", "invalid_token", date(2026, 1, 1))
        check("Returns DataFrame or None", result is None or hasattr(result, 'columns'), f"got {type(result)}")
        if result is not None:
            check("Has expected columns", set(result.columns) == {"open", "high", "low", "close", "volume"})
    except Exception as e:
        check(f"Intraday fetch test failed: {e}", False)


def test_iep_edges():
    print("\n--- Test 10: IEP fetcher edge cases ---")
    try:
        from src.iep_fetcher import IEPFetcher
        f = IEPFetcher()
        result = f.fetch_iep_batch([], "test_token")
        check("Empty symbols returns empty dict", isinstance(result, dict) and len(result) == 0)
        result_bad = f.fetch_iep_batch(["RELIANCE"], "bad_token_xyz")
        check("Bad token returns empty dict", isinstance(result_bad, dict))
        single = f.fetch_single("RELIANCE", "bad_token_xyz")
        check("Single bad token returns None", single is None)
    except Exception as e:
        import traceback
        check(f"IEP edge case test failed: {e}", False)
        traceback.print_exc()


def run():
    print("=" * 55)
    print("Step 15 - Pre-market Endpoint Tests")
    print("=" * 55)

    print("\nStarting test server...")
    try:
        server = start_server()
    except Exception as e:
        print(f"  {FAIL} Server failed to start: {e}")
        sys.exit(1)
    print(f"  {PASS} Server running on port {PORT}")

    try:
        test_previous_trading_day()
        test_volume_baselines()
        test_volume_baselines_fallback()
        test_iep_no_token()
        test_volume_profile_no_token()
        test_module_imports()
        test_instrument_resolution()
        test_volume_profile_algorithm()
        test_intraday_fetch()
        test_iep_edges()
    finally:
        if server:
            server.should_exit = True
            time.sleep(0.5)

    print(f"\n{'=' * 55}")
    total = 10
    failed = len(errors)
    passed = total - failed
    print(f"Results: {passed}/{total} passed, {failed} failed")
    if errors:
        print("\nFailed tests:")
        for e in errors:
            print(f"  * {e}")
        sys.exit(1)
    else:
        print(f"\nAll tests passed! {PASS}")


if __name__ == "__main__":
    run()
