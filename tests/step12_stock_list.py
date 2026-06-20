"""
Tests for Step 12: Stock List (SQLite-based persistence)
Verifies db.py CRUD and server.py endpoints for stock list management.
"""
import sys
import os
import json
import time
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from src.db import (
    add_stock_to_list, remove_stock_from_list,
    get_stock_list, is_stock_in_list, clear_stock_list, init_db,
)

init_db()


def test_add_and_list():
    clear_stock_list("test_list")
    items = get_stock_list("test_list")
    assert len(items) == 0, "List should start empty"

    add_stock_to_list("test_list", "SBIN", close=800.5, depth_pct=12.5)
    items = get_stock_list("test_list")
    assert len(items) == 1
    assert items[0]["symbol"] == "SBIN"
    assert items[0]["close"] == 800.5
    assert items[0]["depth_pct"] == 12.5
    print("  PASS test_add_and_list")


def test_add_duplicate_updates():
    clear_stock_list("test_list")
    add_stock_to_list("test_list", "SBIN", close=800.5)
    is_new = add_stock_to_list("test_list", "SBIN", close=810.0)
    assert is_new == False, "Duplicate should return False (updated, not new)"
    items = get_stock_list("test_list")
    assert items[0]["close"] == 810.0
    print("  PASS test_add_duplicate_updates")


def test_is_in_list():
    clear_stock_list("test_list")
    assert is_stock_in_list("test_list", "SBIN") == False
    add_stock_to_list("test_list", "SBIN")
    assert is_stock_in_list("test_list", "SBIN") == True
    print("  OK test_is_in_list")


def test_remove():
    clear_stock_list("test_list")
    add_stock_to_list("test_list", "SBIN")
    add_stock_to_list("test_list", "TCS")
    assert len(get_stock_list("test_list")) == 2
    existed = remove_stock_from_list("test_list", "SBIN")
    assert existed == True
    assert len(get_stock_list("test_list")) == 1
    existed = remove_stock_from_list("test_list", "UNKNOWN")
    assert existed == False
    print("  OK test_remove")


def test_clear():
    clear_stock_list("test_list")
    add_stock_to_list("test_list", "SBIN")
    add_stock_to_list("test_list", "TCS")
    count = clear_stock_list("test_list")
    assert count == 2
    assert len(get_stock_list("test_list")) == 0
    print("  OK test_clear")


def test_reversal_stock():
    clear_stock_list("test_list")
    add_stock_to_list("test_list", "VEDL", close=531.25, trend_context="uptrend", period=3)
    items = get_stock_list("test_list")
    assert items[0]["trend_context"] == "uptrend"
    assert items[0]["period"] == 3
    assert items[0]["close"] == 531.25
    print("  OK test_reversal_stock")


def test_list_type_isolation():
    clear_stock_list("cont")
    clear_stock_list("rev")
    add_stock_to_list("cont", "SBIN")
    add_stock_to_list("rev", "VEDL")
    assert len(get_stock_list("cont")) == 1
    assert len(get_stock_list("rev")) == 1
    assert get_stock_list("cont")[0]["symbol"] == "SBIN"
    assert get_stock_list("rev")[0]["symbol"] == "VEDL"
    print("  OK test_list_type_isolation")


def test_server_endpoints():
    """Test REST API endpoints using httpx if available."""
    try:
        import httpx
    except ImportError:
        print("  ⚠ Skipping server tests (httpx not installed)")
        return

    import uvicorn
    from server import app

    host = "127.0.0.1"
    port = 18001
    server_thread = threading.Thread(
        target=uvicorn.run,
        args=(app,),
        kwargs={"host": host, "port": port, "log_level": "error"},
        daemon=True,
    )
    server_thread.start()
    time.sleep(2)

    base = f"http://{host}:{port}"

    try:
        # Health check
        r = httpx.get(f"{base}/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"
        print("  OK health check")

        # Add stock
        r = httpx.post(f"{base}/api/stock-list/continuation",
            json={"symbol": "SBIN", "close": 800.5, "depth_pct": 12.5})
        assert r.status_code == 200
        assert r.json()["symbol"] == "SBIN"
        print("  OK add via API")

        # Check stock
        r = httpx.get(f"{base}/api/stock-list/continuation/check/SBIN")
        assert r.json()["in_list"] == True
        print("  OK check via API")

        # List stocks
        r = httpx.get(f"{base}/api/stock-list/continuation")
        assert r.json()["count"] >= 1
        print("  OK list via API")

        # Remove stock
        r = httpx.delete(f"{base}/api/stock-list/continuation/SBIN")
        assert r.status_code == 200
        assert r.json()["symbol"] == "SBIN"
        print("  OK remove via API")

        # Remove non-existent should 404
        r = httpx.delete(f"{base}/api/stock-list/continuation/NONEXIST")
        assert r.status_code == 404
        print("  OK 404 on missing stock")

        # Clear
        httpx.post(f"{base}/api/stock-list/continuation",
            json={"symbol": "TCS", "close": 3500})
        httpx.post(f"{base}/api/stock-list/continuation",
            json={"symbol": "INFY", "close": 1500})
        r = httpx.delete(f"{base}/api/stock-list/continuation")
        assert r.json()["count"] == 2
        print("  OK clear via API")

        # Add reversal stock
        r = httpx.post(f"{base}/api/stock-list/reversal",
            json={"symbol": "VEDL", "close": 531.25, "trend_context": "uptrend", "period": 3})
        assert r.status_code == 200
        r = httpx.get(f"{base}/api/stock-list/reversal")
        assert r.json()["count"] == 1
        assert r.json()["stocks"][0]["trend_context"] == "uptrend"
        print("  OK reversal stock via API")

    finally:
        httpx.delete(f"{base}/api/stock-list/continuation")
        httpx.delete(f"{base}/api/stock-list/reversal")

    print("  OK test_server_endpoints")


if __name__ == "__main__":
    print("Step 12: Stock List Tests\n")

    test_add_and_list()
    test_add_duplicate_updates()
    test_is_in_list()
    test_remove()
    test_clear()
    test_reversal_stock()
    test_list_type_isolation()
    test_server_endpoints()

    # Cleanup
    clear_stock_list("test_list")
    clear_stock_list("cont")
    clear_stock_list("rev")

    print("\nOK All step 12 tests passed!")
