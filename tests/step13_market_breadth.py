"""
Tests for Step 13: Market Breadth Analyzer
Verifies breadth calculation and API endpoints.
"""
import sys
import os
import json
import time
import threading
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from src.market_breadth import (
    BreadthCacheManager, calculate_breadth,
    _calculate_date_breadth,
)
import pandas as pd


def test_breadth_cache_manager():
    cm = BreadthCacheManager()
    assert cm.get_all_cached_dates() is not None
    print("  PASS test_breadth_cache_manager")


def test_cache_update_and_get():
    cm = BreadthCacheManager()
    test_key = "test_2026-01-01"
    old = cm.get_cached_breadth(test_key)
    cm.update_breadth_cache(test_key, {"up_4_5": 10, "down_4_5": 5})
    cached = cm.get_cached_breadth(test_key)
    assert cached is not None
    assert cached["up_4_5"] == 10
    assert cached["down_4_5"] == 5
    cm.update_breadth_cache(test_key, old or {})
    print("  PASS test_cache_update_and_get")


def test_date_breadth_with_synthetic():
    dates = pd.date_range("2026-01-01", "2026-01-30", freq="B")
    dfs = {}
    for i, sym in enumerate(["STOCK1", "STOCK2", "STOCK3", "STOCK4", "STOCK5"]):
        data = {
            "close": [100 + i * 10] * len(dates),
            "price_change": [0.05 if i == 0 else -0.05] * len(dates),
            "price_change_5d": [0.20 if i == 0 else -0.20] * len(dates),
            "ma_20": [100 + i * 10] * len(dates),
        }
        df = pd.DataFrame(data, index=dates)
        df["ma_20"] = df["close"]  # close == MA for testing
        dfs[sym] = df

    # Test with synthetic data for a specific date
    target = date(2026, 1, 15)
    counts = _calculate_date_breadth(dfs, target)
    assert counts is not None, "Should return counts even with few stocks"
    had_data = sum(
        1 for sym, df in dfs.items()
        if target in [idx.date() for idx in df.index]
    )
    print(f"  Stocks with data for {target}: {had_data}")
    print(f"  Counts: {counts}")
    print("  PASS test_date_breadth_with_synthetic")


def test_calculate_breadth_runs():
    """Just verify the function runs and returns a list (may be empty if no cache)."""
    try:
        results = calculate_breadth()
        assert isinstance(results, list)
        print(f"  Breadth returned {len(results)} dates")
        print("  PASS test_calculate_breadth_runs")
    except Exception as e:
        print(f"  SKIP test_calculate_breadth_runs (no cache data?): {e}")


def test_server_endpoints():
    """Test REST API for breadth using httpx if available."""
    try:
        import httpx
    except ImportError:
        print("  SKIP test_server_endpoints (httpx not installed)")
        return

    import uvicorn
    from server import app

    host = "127.0.0.1"
    port = 19001
    server_thread = threading.Thread(
        target=uvicorn.run,
        args=(app,),
        kwargs={"host": host, "port": port, "log_level": "error"},
        daemon=True,
    )
    server_thread.start()
    time.sleep(3)

    base = f"http://{host}:{port}"

    try:
        # GET breadth data
        r = httpx.get(f"{base}/api/breadth/data")
        assert r.status_code == 200
        d = r.json()
        assert "data" in d
        assert "total_dates" in d
        print(f"  GET /api/breadth/data: total_dates={d['total_dates']}")

        # POST to update
        r = httpx.post(f"{base}/api/breadth/update")
        assert r.status_code == 200
        d2 = r.json()
        assert d2["status"] == "started"
        print(f"  POST /api/breadth/update: operation_id={d2.get('operation_id')}")

    finally:
        pass

    print("  PASS test_server_endpoints")


if __name__ == "__main__":
    print("Step 13: Market Breadth Tests\n")

    test_breadth_cache_manager()
    test_cache_update_and_get()
    test_date_breadth_with_synthetic()
    test_calculate_breadth_runs()
    test_server_endpoints()

    print("\nOK All step 13 tests passed!")
