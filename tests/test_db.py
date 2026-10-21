"""
Phase 4 tests: backend/src/db.py — CRUD for settings, stock lists, breadth,
trade log with auto P&L, capital stats, upstox config.
All run against the session tmp SQLite DB (conftest env) with clean_db wiping rows.
"""

import pytest

from src import db


# ---------------- settings ----------------

def test_settings_upsert_and_get(clean_db):
    db.settings_upsert("price_min", "150", type="number", category="filters", label="Min price")
    row = db.settings_get("price_min")
    assert row is not None
    assert row["value"] == "150"
    assert row["category"] == "filters"
    all_rows = db.settings_get_all()
    assert {r["key"] for r in all_rows} == {"price_min"}


def test_settings_upsert_overwrites(clean_db):
    db.settings_upsert("k1", "v1")
    db.settings_upsert("k1", "v2", category="test")
    assert db.settings_get("k1")["value"] == "v2"
    assert db.settings_get("k1")["category"] == "test"


def test_settings_set_value_only(clean_db):
    db.settings_upsert("k2", "v1", label="keepme")
    db.settings_set_value("k2", "v9")
    row = db.settings_get("k2")
    assert row["value"] == "v9"
    assert row["label"] == "keepme"


def test_settings_missing_returns_none(clean_db):
    assert db.settings_get("nope") is None


def test_settings_reset_category(clean_db):
    db.settings_upsert("a", "1", category="catA")
    db.settings_upsert("b", "2", category="catA")
    db.settings_upsert("c", "3", category="catB")
    db.settings_reset_category("catA")
    keys = {r["key"] for r in db.settings_get_all()}
    assert keys == {"c"}


def test_settings_meta(clean_db):
    assert db.settings_get_meta("schema_version") is None
    db.settings_set_meta("schema_version", "3")
    assert db.settings_get_meta("schema_version") == "3"
    db.settings_set_meta("schema_version", "4")
    assert db.settings_get_meta("schema_version") == "4"


# ---------------- stock lists ----------------

def test_stock_list_add_isnew_semantics(clean_db):
    assert db.add_stock_to_list("continuation", "INFY", close=1500.0) is True
    assert db.add_stock_to_list("continuation", "INFY", close=1550.0) is False  # update
    rows = db.get_stock_list("continuation")
    assert len(rows) == 1
    assert rows[0]["close"] == 1550.0


def test_stock_list_operations(clean_db):
    db.add_stock_to_list("reversal", "TATA")
    db.add_stock_to_list("reversal", "ITC")
    assert db.is_stock_in_list("reversal", "TATA") is True
    assert db.is_stock_in_list("reversal", "WIPRO") is False
    assert db.remove_stock_from_list("reversal", "TATA") is True
    assert db.remove_stock_from_list("reversal", "TATA") is False
    cleared = db.clear_stock_list("reversal")
    assert cleared == 1
    assert db.get_stock_list("reversal") == []


def test_stock_list_isolated_by_type(clean_db):
    db.add_stock_to_list("continuation", "SBIN")
    assert db.is_stock_in_list("reversal", "SBIN") is False


# ---------------- breadth ----------------

def test_breadth_upsert_and_overwrite(clean_db):
    db.upsert_breadth("2026-10-20", up_4_5=210, down_4_5=90, above_20ma=1200, below_20ma=900,
                      stocks_with_data=2500)
    db.upsert_breadth("2026-10-20", up_4_5=250, down_4_5=100, above_20ma=1250, below_20ma=850)
    rows = db.get_all_breadth()
    assert len(rows) == 1                       # same date_key → upserted
    assert rows[0]["up_4_5"] == 250
    assert rows[0]["stocks_with_data"] == 0     # default when omitted in second call


def test_breadth_date_keys_and_clear(clean_db):
    for d in ("2026-10-21", "2026-10-20"):
        db.upsert_breadth(d, up_4_5=100)
    assert db.get_breadth_date_keys() == ["2026-10-20", "2026-10-21"]
    db.clear_breadth()
    assert db.get_all_breadth() == []


# ---------------- trade log + P&L ----------------

def _add_trade(symbol="TESTCO", entry=100.0, qty=100, entry_date="2026-10-19", instrument="NSE_EQ|INE000", sid="s1"):
    return db.add_trade_log(
        symbol=symbol, instrument_key=instrument, entry_price=entry,
        entry_sl=entry * 0.97, entry_time="09:45:00", entry_date=entry_date,
        session_id=sid, trade_type="continuation", quantity=qty,
    )


def test_trade_log_add_and_list(clean_db):
    tid = _add_trade()
    assert tid > 0
    trades = db.get_trade_logs()
    assert len(trades) == 1
    t = trades[0]
    assert t["symbol"] == "TESTCO"
    assert t["status"] == "active"      # schema default
    assert t["entry_price"] == 100.0
    assert t["pnl_type"] is None        # unsettled


def test_trade_log_date_filtering(clean_db):
    _add_trade(symbol="A1", entry_date="2026-10-15")
    _add_trade(symbol="A2", entry_date="2026-10-20")
    got = db.get_trade_logs(start_date="2026-10-16", end_date="2026-10-21")
    assert [t["symbol"] for t in got] == ["A2"]


def test_trade_close_autopnl_profit(clean_db):
    tid = _add_trade(entry=100.0, qty=100)
    db.update_trade_log(tid, exit_date="2026-10-20", exit_price=105.5)
    t = db.get_trade_logs()[0]
    assert t["status"] == "closed"
    assert t["pnl_type"] == "profit"
    assert t["pnl_amount"] == pytest.approx(550.0)     # (105.5-100)*100
    assert t["exit_price"] == 105.5


def test_trade_close_autopnl_loss(clean_db):
    tid = _add_trade(entry=200.0, qty=50)
    db.update_trade_log(tid, exit_date="2026-10-20", exit_price=196.0)
    t = db.get_trade_logs()[0]
    assert t["pnl_type"] == "loss"
    assert t["pnl_amount"] == pytest.approx(200.0)     # abs((196-200)*50)


def test_update_get_trade_stats(clean_db):
    tid = _add_trade(entry=100.0, qty=100)
    db.update_trade_log(tid, exit_date="2026-10-20", exit_price=110.0)
    _add_trade(symbol="X1", entry=500.0, entry_date="2026-10-20")
    stats = db.update_get_trade_stats()
    assert stats["total_trades"] == 2
    assert stats["profitable"] == 1
    assert stats["losing"] == 0
    assert stats["unsettled"] == 1


def test_daily_and_yearly_pnl(clean_db):
    t1 = _add_trade(symbol="P1", entry=100.0, qty=100, entry_date="2026-10-19")
    db.update_trade_log(t1, exit_date="2026-10-19", exit_price=104.0)   # +400
    t2 = _add_trade(symbol="P2", entry=100.0, qty=100, entry_date="2026-10-20")
    db.update_trade_log(t2, exit_date="2026-10-20", exit_price=98.0)    # -200
    daily = db.get_daily_pnl(2026, 10)
    assert {d["entry_date"]: d for d in daily}["2026-10-19"]["net_pnl"] == 400.0
    assert {d["entry_date"]: d for d in daily}["2026-10-20"]["net_pnl"] == -200.0
    yearly = db.get_yearly_pnl(2026)
    assert len(yearly) == 2


def test_get_daily_entry_counts(clean_db):
    _add_trade(symbol="C1", entry_date="2026-05-10")
    _add_trade(symbol="C2", entry_date="2026-05-10")
    _add_trade(symbol="C3", entry_date="2026-05-11")
    counts = db.get_daily_entry_counts(2026, 5)
    assert {c["entry_date"]: c["count"] for c in counts} == {"2026-05-10": 2, "2026-05-11": 1}


def test_capital_stats(clean_db):
    tid = _add_trade(entry=100.0, qty=100, entry_date="2026-10-19")
    db.update_trade_log(tid, exit_date="2026-10-19", exit_price=105.0)  # realized +500
    open_tid = _add_trade(symbol="OPENCO", entry=200.0, qty=100)        # active, open value 20000
    stats = db.get_capital_stats()
    assert stats["initial_capital"] == 100000.0          # default (no settings row seeded)
    assert stats["realized_pnl"] == 500.0
    assert stats["open_position_value"] == 20000.0
    assert stats["available_capital"] == pytest.approx(80500.0)


# ---------------- upstox config + migrations ----------------

def test_upstox_config_set_get(clean_db):
    assert db.upstox_get("token") is None
    db.upstox_set("token", "secret-token")
    assert db.upstox_get("token") == "secret-token"
    db.upstox_set("token", "rotated")
    assert db.upstox_get("token") == "rotated"


def test_run_migrations_idempotent(clean_db):
    db._run_migrations()        # must not raise on second call
    db._run_migrations()


# ---------------- cache index helpers ----------------

def test_cache_stats_empty_defaults(clean_db):
    stats = db.get_cache_stats()
    assert stats == {"stock_count": 0, "total_size_mb": 0.0, "latest_date": None}
    assert db.list_symbols_from_index() == []


def test_cache_index_delete(clean_db):
    db.upsert_cache_index("DELA", 100, "2026-01-01", "2026-01-20", 5000)
    db.delete_cache_index("DELA")
    assert db.list_symbols_from_index() == []
