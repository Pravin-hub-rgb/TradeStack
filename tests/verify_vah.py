r"""
verify_vah.py - Manual VAH verification script.

Run anytime to confirm VAH calculation works.
Two modes:
  1. Synthetic data test (no server, no token needed)
  2. Live endpoint test (requires running server + valid Upstox token)

Usage:
  venv\Scripts\python ..\tests\verify_vah.py          # synthetic only
  venv\Scripts\python ..\tests\verify_vah.py --live    # + endpoint test
"""

import sys, json, os, urllib.request, urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

SERVER = "http://127.0.0.1:8001"


# ──────────────────────────────────────────────
# 1. SYNTHETIC DATA TEST (algorithm only)
# ──────────────────────────────────────────────
def test_synthetic():
    print("=" * 60)
    print("VAH Verification — Synthetic Data Test")
    print("=" * 60)

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

    ok = True
    checks = [
        ("VAH is not None", result["vah"] is not None),
        ("VAL is not None", result["val"] is not None),
        ("POC is not None", result["poc"] is not None),
        ("VAH > VAL", result["vah"] > result["val"]),
        ("POC between VAL and VAH", result["val"] <= result["poc"] <= result["vah"]),
        ("Profile has entries", len(result.get("profile", {})) > 0),
    ]
    for label, passed in checks:
        mark = "PASS" if passed else "FAIL"
        print(f"  [{mark}] {label}")
        if not passed:
            ok = False

    print(f"\n  VAH = {result['vah']:.2f}")
    print(f"  VAL = {result['val']:.2f}")
    print(f"  POC = {result['poc']:.2f}")
    print(f"  Profile bins = {len(result.get('profile', {}))}")

    # Edge cases
    empty = calc.calculate_volume_profile(pd.DataFrame())
    print(f"\n  [{'PASS' if empty['vah'] is None else 'FAIL'}] Empty DF -> VAH is None")

    single = pd.DataFrame([{"open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 10000}])
    sr = calc.calculate_volume_profile(single)
    print(f"  [{'PASS' if sr['vah'] is None else 'FAIL'}] Single row -> VAH is None")

    print(f"\n{'=' * 60}")
    if ok:
        print("Result: SYNTHETIC TEST PASSED")
    else:
        print("Result: SYNTHETIC TEST FAILED")
        sys.exit(1)
    print("=" * 60)


# ──────────────────────────────────────────────
# 2. LIVE ENDPOINT TEST (requires server + token)
# ──────────────────────────────────────────────
def test_live():
    print("\n" + "=" * 60)
    print("VAH Verification — Live Endpoint Test")
    print("=" * 60)

    # Check server is running
    try:
        r = urllib.request.urlopen(f"{SERVER}/health", timeout=3)
        assert r.status == 200
        print("  [PASS] Server is running")
    except Exception as e:
        print(f"  [SKIP] Server not reachable ({e})")
        print("  Start with: bun run dev  or  python server.py")
        return

    # Check token
    try:
        r = urllib.request.urlopen(f"{SERVER}/api/token/status", timeout=3)
        td = json.loads(r.read())
        if not td.get("exists"):
            print("  [SKIP] No Upstox token configured")
            print("  Add a token via the UI or POST /api/token/validate")
            return
    except Exception as e:
        print(f"  [SKIP] Token check failed ({e})")
        return

    # Test with known symbols
    symbols = ["20MICRONS", "RELIANCE", "TCS"]
    data = json.dumps({"symbols": symbols}).encode()
    req = urllib.request.Request(
        f"{SERVER}/api/prep/volume-profile",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  [FAIL] Endpoint returned {e.code}: {body}")
        return
    except Exception as e:
        print(f"  [FAIL] Request failed: {e}")
        return

    vah = result.get("vah", {})
    count = result.get("count", 0)
    total = result.get("total_requested", 0)
    print(f"  [PASS] Got VAH for {count}/{total} symbols")

    for sym in symbols:
        price = vah.get(sym)
        if price:
            print(f"    {sym:14s} -> {price:>8.2f} OK")
        else:
            print(f"    {sym:14s} -> N/A (no data for previous trading day)")

    if count > 0:
        print(f"\n  Result: LIVE ENDPOINT TEST PASSED")
    else:
        print(f"\n  Result: LIVE ENDPOINT TEST - no VAH data returned (maybe weekend/holiday?")

    print("=" * 60)


if __name__ == "__main__":
    test_synthetic()
    if "--live" in sys.argv:
        test_live()
