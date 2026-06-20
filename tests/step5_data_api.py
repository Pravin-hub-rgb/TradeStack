"""
Test script for Step 5: Data API Endpoints.
Starts the FastAPI server on a temporary port and tests all endpoints via HTTP.

Usage:
  cd MA_Stock_Trader_NA
  backend/venv/Scripts/python tests/step5_data_api.py
"""

import sys
import shutil
import json
import time
import urllib.request
import urllib.error
import threading
from pathlib import Path
from datetime import date
from http.client import HTTPConnection

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

PASS = "[PASS]"
WARN = "[WARN]"

PORT = 18001
BASE = f"http://127.0.0.1:{PORT}"
OLD_CACHE = Path(r"C:\Users\Pravin\Desktop\main\MA_Stock_Trader\data\cache")
TEST_STOCKS = ["20MICRONS", "360ONE", "3MINDIA"]


def _request(method: str, path: str, body: dict = None) -> tuple:
    """Make an HTTP request and return (status_code, data_dict)."""
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def server_thread_fn():
    from server import app
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="error")


_copied_by_test: list[str] = []


def setup_test_data():
    """Copy test stocks into cache, tracking what was copied for safe cleanup."""
    from src.cache_manager import cache_manager
    global _copied_by_test
    _copied_by_test = []
    for sym in TEST_STOCKS:
        src = OLD_CACHE / f"{sym}.pkl"
        dest = cache_manager.cache_dir / f"{sym}.pkl"
        if src.exists() and not dest.exists():
            shutil.copy2(src, dest)
            _copied_by_test.append(sym)


def teardown_test_data():
    """Remove only the stocks that this test copied (not pre-existing cache files)."""
    from src.cache_manager import cache_manager
    global _copied_by_test
    for sym in _copied_by_test:
        p = cache_manager.get_cache_path(sym)
        if p.exists():
            p.unlink()
    _copied_by_test = []


def test_health():
    status, data = _request("GET", "/health")
    assert status == 200
    assert data["status"] == "healthy"
    print(f"{PASS} test_health")


def test_root():
    status, data = _request("GET", "/")
    assert status == 200
    assert data["status"] == "ok"
    print(f"{PASS} test_root")


def test_cache_info():
    status, data = _request("GET", "/api/data/cache-info")
    assert status == 200
    assert "stock_count" in data
    assert "total_size_mb" in data
    assert data["stock_count"] == len(TEST_STOCKS)
    print(f"{PASS} test_cache_info (count={data['stock_count']})")


def test_symbols():
    status, data = _request("GET", "/api/data/symbols")
    assert status == 200
    assert data["count"] == len(TEST_STOCKS)
    for sym in TEST_STOCKS:
        assert sym in data["symbols"]
    print(f"{PASS} test_symbols ({data['symbols']})")


def test_cache_dates():
    status, data = _request("GET", "/api/data/cache-dates")
    assert status == 200
    assert data["count"] > 0
    assert len(data["dates"]) == data["count"]
    print(f"{PASS} test_cache_dates ({data['count']} unique dates)")


def test_update_bhavcopy():
    """Trigger a bhavcopy update and poll until complete."""
    status, data = _request("POST", "/api/data/update-bhavcopy", {"date": "2026-06-05"})
    assert status == 200
    assert data["status"] == "started"
    op_id = data["operation_id"]
    assert data["target_date"] == "2026-06-05"

    # Poll until done
    for _ in range(20):
        time.sleep(0.5)
        status, poll = _request("GET", f"/api/data/status/{op_id}")
        assert status == 200
        if poll["status"] in ("completed", "error"):
            break

    assert poll["status"] == "completed", f"Update failed: {poll.get('error', 'unknown')}"
    assert poll["result"]["updated"] >= 1
    assert poll["result"]["duration_sec"] > 0
    print(f"{PASS} test_update_bhavcopy ({poll['result']['updated']} updated in {poll['result']['duration_sec']}s)")


def test_status_404():
    status, data = _request("GET", "/api/data/status/nonexistent")
    assert status == 404
    print(f"{PASS} test_status_404")


if __name__ == "__main__":
    print("=" * 50)
    print("Step 5: Data API Tests")
    print("=" * 50)

    setup_test_data()

    # Start server in background thread
    server = threading.Thread(target=server_thread_fn, daemon=True)
    server.start()
    time.sleep(2)

    errors = []
    try:
        test_health()
        test_root()
        test_cache_info()
        test_symbols()
        test_cache_dates()
        test_update_bhavcopy()
        test_status_404()
    except Exception as e:
        errors.append(str(e))
        import traceback
        traceback.print_exc()
    finally:
        teardown_test_data()

    if errors:
        print(f"\n{WARN} {len(errors)} test(s) failed")
        sys.exit(1)
    print("=" * 50)
    print("All tests passed!")
    print("=" * 50)
