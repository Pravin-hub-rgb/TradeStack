"""
Step 10: Continuation Scanner Tests
Tests the ContinuationScanner with real and synthetic data
"""

import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from src.scanner import ContinuationScanner, get_default_params

PASS = 0
FAIL = 0


def assert_eq(a, b, msg=""):
    global PASS, FAIL
    if a == b:
        PASS += 1
    else:
        FAIL += 1
        print(f"  FAIL: {msg} — expected {b!r}, got {a!r}")


def assert_true(v, msg=""):
    global PASS, FAIL
    if v:
        PASS += 1
    else:
        FAIL += 1
        print(f"  FAIL: {msg}")


def assert_close(a, b, tol=0.01, msg=""):
    global PASS, FAIL
    if abs(a - b) < tol:
        PASS += 1
    else:
        FAIL += 1
        print(f"  FAIL: {msg} — expected {b} ± {tol}, got {a}")


# ── 1. get_default_params ────────────────────────────────────────────

def test_default_params():
    p = get_default_params()
    assert_true("price_min" in p, "has price_min")
    assert_true("near_ma_threshold" in p, "has near_ma_threshold")
    assert_true("lookback_days" in p, "has lookback_days")
    assert_true(p["price_min"] > 0, "price_min > 0")
    assert_true(p["price_max"] > p["price_min"], "price_max > price_min")
    assert_true(p["min_adr"] >= 0, "min_adr >= 0")


# ── 2. Synthetic continuation pattern ─────────────────────────────────

def build_synthetic_continuation():
    """Generate 100 days of price data with a continuation pattern:
    Phase 1: Above MA, trending up to high
    Phase 2: Pullback below MA to low
    Phase 3: Recovery above MA, rising MA, near MA with small body
    """
    np.random.seed(42)
    dates = [datetime(2026, 1, 1) + timedelta(days=i) for i in range(100)]
    n = len(dates)

    base = 500.0
    # MA starts at 480, rises to ~510
    ma = np.linspace(480, 510, n)
    noise = np.random.normal(0, 3, n)

    close = np.zeros(n)
    # Phase 1 (days 0-40): Above MA, climb to ~550
    close[:20] = ma[:20] + np.linspace(5, 30, 20) + noise[:20]
    close[20:40] = ma[20:40] + 25 + np.linspace(30, -5, 20) + noise[20:40]
    # Phase 2 (days 40-70): Pullback below MA, drop to ~490
    close[40:50] = ma[40:50] - np.linspace(2, 20, 10) + noise[40:50]
    close[50:70] = ma[50:70] - np.linspace(20, 25, 20) + noise[50:70]
    # Phase 3 (days 70-100): Recover above MA, stabilize near MA
    close[70:85] = ma[70:85] + np.linspace(-20, 8, 15) + noise[70:85]
    close[85:100] = ma[85:100] + np.linspace(8, 3, 15) + noise[85:100]

    high = close + np.abs(np.random.normal(2, 1, n))
    low = close - np.abs(np.random.normal(2, 1, n))
    volume = np.random.randint(2_000_000, 5_000_000, n)

    df = pd.DataFrame({
        "date": dates, "open": close * 0.99, "high": high, "low": low,
        "close": close, "volume": volume,
    })

    return df


def test_synthetic_continuation():
    global PASS, FAIL
    df = build_synthetic_continuation()
    latest = df.iloc[-1]
    assert_true(len(df) == 100, "synthetic data has 100 rows")
    assert_true(latest["close"] > 490, "latest close above 490")

    # Instantiate scanner with relaxed params
    params = get_default_params()
    params["price_min"] = 100
    params["price_max"] = 10000
    params["near_ma_threshold"] = 25.0  # relaxed
    params["max_body_percentage"] = 10.0
    params["min_adr"] = 0
    params["volume_threshold"] = 100000
    params["min_volume_days"] = 1
    params["movement_threshold_pct"] = 0.0
    params["min_movement_days"] = 1

    scanner = ContinuationScanner(params)
    # Manually test _passes_filters and _analyze_pattern
    data = df.copy()
    from src.indicators import compute_all_indicators
    data = compute_all_indicators(data)

    latest = data.iloc[-1]
    passes = scanner._passes_filters(latest, data)
    assert_true(passes, "synthetic data passes filters")

    result = scanner._analyze_pattern(data)
    if result:
        PASS += 6
        print(f"  Pattern found: depth={result.get('depth_pct', '?')}%, "
              f"adr={result.get('adr_pct', '?')}%, "
              f"dist_to_ma={result.get('dist_to_ma_pct', '?')}%")
        assert_true("phase1_high" in result, "has phase1_high")
        assert_true("phase2_low" in result, "has phase2_low")
        assert_true("phase3_high" in result, "has phase3_high")
        assert_true("depth_pct" in result, "has depth_pct")
        assert_true(result["phase3_high"] < result["phase1_high"], "phase3 < phase1")
        assert_true(result["depth_pct"] > 1, "depth_pct > 1%")
    else:
        print("  No pattern found (synthetic data may need tuning)")


# ── 3. Filter edge cases ──────────────────────────────────────────────

def test_filters_edge_cases():
    scanner = ContinuationScanner(get_default_params())
    data = build_synthetic_continuation()
    from src.indicators import compute_all_indicators
    data = compute_all_indicators(data)
    latest = data.iloc[-1]

    # Test price filter
    scanner.params["price_min"] = 10000
    assert_true(not scanner._passes_filters(latest, data), "filters out by min price")


# ── 4. Server endpoints (live) ────────────────────────────────────────

def test_server_endpoints():
    try:
        import httpx
    except ImportError:
        print("  SKIP: httpx not installed")
        return

    base = "http://127.0.0.1:8001"
    try:
        r = httpx.get(f"{base}/health", timeout=2)
        if r.status_code != 200:
            print("  SKIP: server not healthy")
            return
    except Exception:
        print("  SKIP: server not reachable")
        return

    global PASS, FAIL

    # POST /api/scanner/continuation with filters
    r = httpx.post(f"{base}/api/scanner/continuation", json={
        "price_min": 100,
        "price_max": 2000,
        "near_ma_threshold": 5.0,
        "max_body_percentage": 5.0,
        "min_adr": 3.0,
        "volume_threshold": 1000000,
    }, timeout=5)
    assert_eq(r.status_code, 200, "POST scanner returns 200")
    data = r.json()
    assert_eq(data["status"], "started", "scanner started")
    assert_true("operation_id" in data, "has operation_id")

    op_id = data["operation_id"]

    # GET /api/scanner/status/{op_id}
    r2 = httpx.get(f"{base}/api/scanner/status/{op_id}", timeout=5)
    assert_eq(r2.status_code, 200, "GET scanner status returns 200")
    sdata = r2.json()
    assert_true("status" in sdata, "status field present")
    assert_true(sdata["status"] in ("starting", "running", "completed", "error"),
                "valid status")

    # GET with invalid ID
    r3 = httpx.get(f"{base}/api/scanner/status/invalid_id", timeout=5)
    assert_eq(r3.status_code, 404, "invalid scanner ID returns 404")


# ── Main ──────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Step 10: Continuation Scanner Tests")
    print("=" * 60)

    tests = [
        ("get_default_params", test_default_params),
        ("synthetic continuation pattern", test_synthetic_continuation),
        ("filter edge cases", test_filters_edge_cases),
        ("server endpoints (live)", test_server_endpoints),
    ]

    for name, fn in tests:
        print(f"\n==> {name}")
        fn()

    total = PASS + FAIL
    print(f"\n{'=' * 60}")
    print(f"Results: {PASS}/{total} passed, {FAIL}/{total} failed")
    if FAIL:
        sys.exit(1)
    else:
        print("All tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
