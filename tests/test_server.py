"""
Phase 4 tests: backend/server.py — FastAPI smoke tests via TestClient.

Runs against the session tmp DB (conftest env). We only hit SAFE endpoints:
health, settings CRUD, stock-list CRUD, trade log, breadth read, bias.
We deliberately avoid scan/bhavcopy/download endpoints (they spawn
background work/ProcessPool/network against the real cache).
"""

import httpx  # noqa: F401 — required by fastapi TestClient's ASGI transport

import pytest
from fastapi.testclient import TestClient

import server  # noqa: F401 — imports the FastAPI app (seeds tmp-DB settings at import)

client = TestClient(server.app)


@pytest.fixture(autouse=True)
def seed_settings_for_server():
    """
    The tmp DB may be empty at this point (other test files wipe tables in
    teardown — the server module was seeded during collection). Re-seed so
    settings endpoints see defaults; idempotent when rows already exist.
    """
    from src.settings import ensure_settings

    ensure_settings()
    yield


def test_root_and_health():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "TradeStack"}
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy"}


def test_settings_list_and_single_key():
    r = client.get("/api/settings")
    assert r.status_code == 200
    data = r.json()["settings"]
    assert len(data) > 0
    keys = {row["key"] for row in data}
    assert "price_min" in keys          # seeded defaults exist
    r2 = client.get("/api/settings/price_min")
    assert r2.status_code == 200
    # endpoint returns src.settings.get → type-cast value (number → 100)
    assert r2.json()["value"] == 100
    r3 = client.get("/api/settings/__missing__")
    assert r3.status_code == 404


def test_settings_set_and_reset():
    r = client.put("/api/settings/price_min", json={"value": "175"})
    assert r.status_code == 200
    assert client.get("/api/settings/price_min").json()["value"] == 175   # cast number
    # reset whole settings back to defaults (safe: tmp DB)
    r2 = client.post("/api/settings/reset")
    assert r2.status_code == 200
    assert client.get("/api/settings/price_min").json()["value"] == 100


def test_stock_list_crud_roundtrip():
    lt = "delete-me-list"
    r = client.post(f"/api/stock-list/{lt}", json={"symbol": "TESTCO", "close": 500.0})
    assert r.status_code == 200
    assert r.json()["status"] == "added"
    r2 = client.get(f"/api/stock-list/{lt}")
    body = r2.json()
    assert body["count"] == 1 and body["stocks"][0]["symbol"] == "TESTCO"
    r3 = client.get(f"/api/stock-list/{lt}/check/TESTCO")
    assert r3.json()["in_list"] is True
    # duplicate add returns updated
    r4 = client.post(f"/api/stock-list/{lt}", json={"symbol": "TESTCO"})
    assert r4.json()["status"] == "updated"
    # remove
    r5 = client.delete(f"/api/stock-list/{lt}/TESTCO")
    assert r5.json()["status"] == "removed"
    r6 = client.delete(f"/api/stock-list/{lt}/TESTCO")
    assert r6.status_code == 404
    # clear endpoint
    client.post(f"/api/stock-list/{lt}", json={"symbol": "X1"})
    r7 = client.delete(f"/api/stock-list/{lt}")
    assert r7.json()["count"] == 1


def test_breadth_empty_and_bias_no_data():
    r = client.get("/api/breadth/data")
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == [] and body["total_dates"] == 0
    r2 = client.get("/api/breadth/bias")
    assert r2.status_code == 200
    assert r2.json()["bias"] == "NO_DATA"


def test_trade_log_roundtrip_with_pnl():
    payload = {
        "symbol": "SMKCO",
        "instrument_key": "NSE_EQ|INE000TEST",
        "entry_price": 100.0,
        "entry_sl": 97.0,
        "entry_time": "09:30:00",
        "entry_date": "2026-10-19",
        "session_id": "test-session",
        "trade_type": "continuation",
        "quantity": 100,
    }
    r = client.post("/api/trades/log-entry", json=payload)
    assert r.status_code == 200
    tid = r.json()["id"]
    lst = client.get("/api/trades/list").json()
    assert lst["count"] == 1 and lst["trades"][0]["symbol"] == "SMKCO"
    assert client.get("/api/trades/stats").json()["unsettled"] == 1
    # close the trade → auto P&L
    r2 = client.put(f"/api/trades/{tid}", json={"exit_date": "2026-10-20", "exit_price": 110.0})
    assert r2.status_code == 200
    stats = client.get("/api/trades/stats").json()
    assert stats["profitable"] == 1
    # daily pnl heatmap row (exit 110 - entry 100 = 10 × qty 100 = +1000)
    pnl = client.get("/api/trades/daily-pnl", params={"year": 2026, "month": 10}).json()
    assert pnl["days"][0]["net_pnl"] == 1000.0
    # delete → empty again
    assert client.delete(f"/api/trades/{tid}").status_code == 200
    assert client.get("/api/trades/list").json()["count"] == 0


def test_cache_info_endpoint_shapes_ok():
    r = client.get("/api/data/cache-info")
    assert r.status_code == 200
    body = r.json()
    # shape contract (tmp DB empty → falls back to filesystem stats/cache is real dir)
    assert "stock_count" in body
    assert "total_size_mb" in body
