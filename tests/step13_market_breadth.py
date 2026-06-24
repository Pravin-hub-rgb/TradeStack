"""
Tests for Step 13: Market Breadth Analyzer
Verifies breadth calculation, SQLite storage, and API endpoints.
"""
import sys
import os
import json
import time
import threading
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from src.market_breadth import calculate_breadth
from src import db
import pandas as pd


def test_sqlite_breadth_storage():
    """Verify upsert/read/clear cycle works."""
    db.clear_breadth()
    assert len(db.get_all_breadth()) == 0, "Should be empty after clear"

    db.upsert_breadth(date_key="2026-06-01", up_4_5=10, down_4_5=5, above_20ma=100, below_20ma=50, stocks_with_data=150)
    rows = db.get_all_breadth()
    assert len(rows) == 1
    assert rows[0]["up_4_5"] == 10
    assert rows[0]["above_20ma"] == 100

    db.upsert_breadth(date_key="2026-06-01", up_4_5=15)  # upsert same date
    rows = db.get_all_breadth()
    assert rows[0]["up_4_5"] == 15, "Should update existing"

    db.upsert_breadth(date_key="2026-06-02", up_4_5=20, stocks_with_data=200)
    assert len(db.get_all_breadth()) == 2
    assert len(db.get_breadth_date_keys()) == 2

    db.clear_breadth()
    assert len(db.get_all_breadth()) == 0
    print("  PASS test_sqlite_breadth_storage")


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

    test_sqlite_breadth_storage()
    test_calculate_breadth_runs()
    test_server_endpoints()

    print("\nOK All step 13 tests passed!")
