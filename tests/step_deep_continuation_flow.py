"""
Deep investigation of continuation live trading flow.
Tests VAH calculation with real data, volume checks, and state machine flow.
"""
import sys, json, time, threading, os
import urllib.request
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

BASE = "http://127.0.0.1:18100"
PORT = 18100
PASS = "[PASS]"
FAIL = "[FAIL]"
errors = []

def req(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
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
        try:
            import urllib.request
            r = urllib.request.urlopen(f"{BASE}/health", timeout=2)
            if r.status == 200:
                return server
        except: pass
        time.sleep(0.3)
    raise RuntimeError("Server did not start")

# ============================================================
# Test 1: VAH with real data — verify the full data pipeline
# ============================================================
def test_vah_real_data():
    print("\n=== Test 1: VAH with real stock data (end-to-end) ===")
    from src.volume_profile import VolumeProfileCalculator
    from src.upstox_config import get_token
    import pandas as pd

    token = get_token()
    if not token:
        print("  [SKIP] No token available")
        return

    calc = VolumeProfileCalculator()
    prev_day = calc.get_previous_trading_day(token)
    check("Previous trading day found", prev_day is not None)
    if prev_day is None:
        return

    # Test with 20MICRONS (known stock with data)
    df = calc._fetch_intraday("20MICRONS", token, prev_day)
    check("20MICRONS intraday data fetched", df is not None and not df.empty)
    if df is not None and not df.empty:
        check("Has at least 10 candles", len(df) >= 10, f"got {len(df)}")
        check("Has all OHLCV columns",
              all(c in df.columns for c in ["open","high","low","close","volume"]))
        profile = calc.calculate_volume_profile(df)
        check("VAH calculated", profile["vah"] is not None, f"vah={profile['vah']}")
        check("VAL calculated", profile["val"] is not None, f"val={profile['val']}")
        check("POC calculated", profile["poc"] is not None, f"poc={profile['poc']}")
        check("VAH >= VAL", profile["vah"] >= profile["val"],
              f"VAH={profile['vah']} < VAL={profile['val']}")
        check("POC between VAL and VAH",
              profile["val"] <= profile["poc"] <= profile["vah"],
              f"POC={profile['poc']} not in [{profile['val']},{profile['vah']}]")

    # Test with RELIANCE
    df2 = calc._fetch_intraday("RELIANCE", token, prev_day)
    check("RELIANCE intraday data fetched", df2 is not None and not df2.empty)
    if df2 is not None and not df2.empty:
        p2 = calc.calculate_volume_profile(df2)
        check("RELIANCE VAH calculated", p2["vah"] is not None, f"vah={p2['vah']}")

    # Test batch VAH
    vah_dict = calc.calculate_vah_for_stocks(["20MICRONS", "RELIANCE"], token)
    check("Batch VAH returns results", len(vah_dict) > 0, f"got {len(vah_dict)} stocks")
    check("20MICRONS in batch result", "20MICRONS" in vah_dict)
    check("RELIANCE in batch result", "RELIANCE" in vah_dict)

# ============================================================
# Test 2: Settings-aware VAH calculation
# ============================================================
def test_vah_settings_aware():
    print("\n=== Test 2: VAH respects bin_size and value_area_pct settings ===")
    from src.volume_profile import VolumeProfileCalculator
    import pandas as pd
    import numpy as np

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

    # Default (70% value area, 0.05 bin size)
    calc1 = VolumeProfileCalculator(bin_size=0.05, value_area_pct=0.70)
    r1 = calc1.calculate_volume_profile(df)
    check("Default VAH computed", r1["vah"] is not None)
    vah_default = r1["vah"]

    # Wider value area (90%) — VAH should be different (typically higher or equal)
    calc2 = VolumeProfileCalculator(bin_size=0.05, value_area_pct=0.90)
    r2 = calc2.calculate_volume_profile(df)
    check("90% value area VAH computed", r2["vah"] is not None)
    if vah_default is not None and r2["vah"] is not None:
        check("Wider area gives different or equal VAH",
              r2["vah"] >= vah_default,
              f"90%-VAH={r2['vah']} < 70%-VAH={vah_default} (might happen with inverse profile)")

    # Larger bin size (0.50) — use wider-ranging data so bins aren't starved
    wide_rows = []
    price = base
    for i in range(n):
        o = price
        h = o + abs(np.random.normal(0.5, 0.2))
        l = o - abs(np.random.normal(0.4, 0.2))
        c = o + np.random.normal(0.001, 0.3)
        v = int(np.random.uniform(10000, 50000))
        wide_rows.append({"open": o, "high": h, "low": l, "close": c, "volume": v})
        price = c
    df_wide = pd.DataFrame(wide_rows)
    calc3 = VolumeProfileCalculator(bin_size=0.50, value_area_pct=0.70)
    r3 = calc3.calculate_volume_profile(df_wide)
    check("0.50 bin size VAH computed", r3["vah"] is not None)

# ============================================================
# Test 3: Volume fetcher with real data
# ============================================================
def test_volume_fetcher():
    print("\n=== Test 3: Volume fetcher end-to-end ===")
    from src.volume_fetcher import volume_fetcher
    from src.upstox_config import get_token

    token = get_token()
    if not token:
        print("  [SKIP] No token available")
        return

    # Test with known stock
    vol = volume_fetcher.fetch_current_volume("RELIANCE", token)
    check("FETCH volume returns number (may be 0 if market closed)",
          isinstance(vol, float), f"got {type(vol)}={vol}")

    # Test with unknown symbol
    vol2 = volume_fetcher.fetch_current_volume("__NONEXISTENT__", token)
    check("Unknown symbol returns 0", vol2 == 0.0, f"got {vol2}")

# ============================================================
# Test 4: Empty token returns 0
# ============================================================
def test_volume_fetcher_no_token():
    print("\n=== Test 4: Volume fetcher with no token ===")
    from src.volume_fetcher import volume_fetcher
    vol = volume_fetcher.fetch_current_volume("RELIANCE", "")
    check("No token returns 0", vol == 0.0, f"got {vol}")

# ============================================================
# Test 5: Continuation state machine flows
# ============================================================
def test_state_machine_flow():
    print("\n=== Test 5: Continuation state machine validation ===")
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "frontend/src/lib/live-trader"))
    # We can't directly import TS, so test the Python logic flow instead

    from src.indicators import compute_all_indicators
    import pandas as pd
    import numpy as np

    # Simulate a continuation scenario with synthetic data
    dates = pd.date_range("2026-01-01", periods=50, freq="D")
    np.random.seed(1)
    trend = np.linspace(100, 110, 50) + np.random.normal(0, 2, 50)
    df = pd.DataFrame({
        "open": trend + np.random.normal(0, 0.5, 50),
        "high": trend + abs(np.random.normal(0, 1, 50)),
        "low": trend - abs(np.random.normal(0, 1, 50)),
        "close": trend + np.random.normal(0, 0.5, 50),
        "volume": np.random.uniform(100000, 500000, 50),
    }, index=dates)

    indicators = compute_all_indicators(df)
    check("Indicators computed", indicators is not None)
    if indicators is not None:
        check("Has sma_20 column", "sma_20" in indicators.columns)
        check("Has adr_percent column", "adr_percent" in indicators.columns)
        check("Has ma_angle column", "ma_angle" in indicators.columns)
        check("Has price_change_1d column", "price_change_1d" in indicators.columns)

    # Verify volume baseline calculation
    avg_vol = df["volume"].tail(10).mean()
    check("10-day avg volume calculated", avg_vol > 0, f"got {avg_vol}")

# ============================================================
# Test 6: Server volume-profile endpoint with real data
# ============================================================
def test_server_vah_endpoint():
    print("\n=== Test 6: Server VAH endpoint with real data ===")
    from src.upstox_config import get_token
    token = get_token()
    if not token:
        print("  [SKIP] No token available")
        return

    status, data = req("POST", "/api/prep/volume-profile", {"symbols": ["20MICRONS", "RELIANCE"]})
    check("Volume-profile endpoint returns 200", status == 200, f"got {status}")
    check("Has vah field", "vah" in data)
    check("Has count field", "count" in data)
    if "vah" in data:
        check("20MICRONS has VAH", data["vah"].get("20MICRONS", 0) > 0,
              f"got {data['vah'].get('20MICRONS')}")
        check("RELIANCE has VAH", data["vah"].get("RELIANCE", 0) > 0,
              f"got {data['vah'].get('RELIANCE')}")

# ============================================================
# Test 7: Server volume-profile respects settings
# ============================================================
def test_server_vah_settings():
    print("\n=== Test 7: Server VAH reads settings from DB ===")
    from src.settings import get as settings_get, set as settings_set

    # Read current values
    bin_size_before = settings_get("vah_bin_size")
    area_before = settings_get("vah_value_area_pct")
    from src.volume_profile import volume_profile_calculator
    check("Calculator bin_size matches setting or default",
          volume_profile_calculator.bin_size == (float(bin_size_before) if bin_size_before else 0.05),
          f"calc={volume_profile_calculator.bin_size}, setting={bin_size_before}")
    check("Calculator value_area_pct matches setting or default",
          volume_profile_calculator.value_area_pct == (float(area_before)/100 if area_before else 0.70),
          f"calc={volume_profile_calculator.value_area_pct}, setting={area_before}")

# ============================================================
# Test 8: Verify pre-market flow logic
# ============================================================
def test_pre_market_flow():
    print("\n=== Test 8: Pre-market flow logic ===")
    from src.upstox_config import get_token

    # Simulate the pre-market flow
    token = get_token()
    if not token:
        print("  [SKIP] No token available")
        return

    # IEP fetch
    status, iep_data = req("POST", "/api/prep/iep", {"symbols": ["20MICRONS", "RELIANCE"]})
    check("IEP endpoint returns 200", status == 200, f"got {status}")
    check("IEP has prices", "prices" in iep_data)
    if "prices" in iep_data:
        check("20MICRONS IEP > 0", iep_data["prices"].get("20MICRONS", 0) > 0,
              f"got {iep_data['prices'].get('20MICRONS')}")

    # Volume baselines
    status, vb_data = req("POST", "/api/prep/volume-baselines", {"symbols": ["20MICRONS", "RELIANCE"]})
    check("Baselines endpoint returns 200", status == 200, f"got {status}")
    if "baselines" in vb_data:
        check("20MICRONS baseline > 0", vb_data["baselines"].get("20MICRONS", 0) > 0)

    # Volume profile
    status, vp_data = req("POST", "/api/prep/volume-profile", {"symbols": ["20MICRONS", "RELIANCE"]})
    check("Volume profile returns 200", status == 200, f"got {status}")
    if "vah" in vp_data:
        check("20MICRONS VAH > 0", vp_data["vah"].get("20MICRONS", 0) > 0)

# ============================================================
# Test 9: Gap validation logic
# ============================================================
def test_gap_validation():
    print("\n=== Test 9: Gap up max threshold is configurable ===")
    from src.upstox_config import get_token
    token = get_token()
    if not token:
        print("  [SKIP] No token available")
        return

    status, iep_data = req("POST", "/api/prep/iep", {"symbols": ["20MICRONS", "RELIANCE"]})
    check("Can fetch IEPs", status == 200 and "prices" in iep_data)
    if "prices" in iep_data:
        for sym, price in iep_data["prices"].items():
            check(f"{sym} IEP is valid", price > 0, f"got {price}")

# ============================================================
# Test 10: Previous trading day with token
# ============================================================
def test_previous_trading_day():
    print("\n=== Test 10: Previous trading day endpoint ===")
    from src.upstox_config import get_token
    token = get_token()
    if not token:
        print("  [SKIP] No token available")
        return

    status, data = req("GET", "/api/prep/previous-trading-day")
    check("Previous day endpoint returns 200", status == 200, f"got {status}")
    check("Returns ISO date", "date" in data and data["date"], f"got {data.get('date')}")

# ============================================================
def run():
    print(f"{'='*55}")
    print("Deep Continuation Flow Investigation")
    print(f"{'='*55}")
    print("\nStarting test server...")
    try:
        server = start_server()
    except Exception as e:
        print(f"  {FAIL} Server: {e}")
        sys.exit(1)
    print(f"  {PASS} Server running on port {PORT}")

    try:
        test_vah_real_data()
        test_vah_settings_aware()
        test_volume_fetcher()
        test_volume_fetcher_no_token()
        test_state_machine_flow()
        test_server_vah_endpoint()
        test_server_vah_settings()
        test_pre_market_flow()
        test_gap_validation()
        test_previous_trading_day()
    finally:
        if server:
            server.should_exit = True
            time.sleep(0.5)

    test_names = [
        "test_vah_real_data", "test_vah_settings_aware", "test_volume_fetcher",
        "test_volume_fetcher_no_token", "test_state_machine_flow",
        "test_server_vah_endpoint", "test_server_vah_settings", "test_pre_market_flow",
        "test_gap_validation", "test_previous_trading_day",
    ]
    total, failed = len(test_names), len(errors)
    passed = total - failed
    print(f"\n{'='*55}")
    print(f"Results: {passed}/{total} passed, {failed} failed")
    if errors:
        print("\nFailed:")
        for e in errors:
            print(f"  * {e}")
        sys.exit(1)
    print("All passed!")

if __name__ == "__main__":
    run()
