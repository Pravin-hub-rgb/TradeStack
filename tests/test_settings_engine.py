"""
Phase 4 tests: backend/src/settings.py — settings engine.

Regression: SEED rows containing UI-only "options" crashed ensure_settings /
reset_all on a FRESH database (db.settings_upsert(**r) TypeError). Any run
here against the tmp DB exercises those paths for real.
"""

import pytest

from src import db
from src.settings import (
    SEED,
    SETTINGS_VERSION,
    ensure_settings,
    get,
    get_all,
    get_all_as_dict,
    _cast_value,
    reset_all,
    reset_category,
    set as settings_set,
)


def test_ensure_settings_fresh_database(clean_db):
    """The regression: seeding on an empty DB must not crash on options-bearing rows."""
    ensure_settings()
    keys = {r["key"] for r in db.settings_get_all()}
    assert {"market_open", "price_min", "cont_near_ma_direction", "trading_capital"} <= keys
    assert db.settings_get_meta("settings_version") == SETTINGS_VERSION


def test_ensure_settings_idempotent(clean_db):
    ensure_settings()
    before = {r["key"]: r["value"] for r in db.settings_get_all()}
    db.settings_set_value("price_min", "777")
    ensure_settings()
    after = {r["key"]: r["value"] for r in db.settings_get_all()}
    # seeded again but user edits preserved; no crash, no count change
    assert after["price_min"] == "777"
    assert sorted(before.keys()) == sorted(after.keys())


def test_cont_near_ma_direction_options_row_never_crashes(clean_db):
    """The exact row that used to crash seeding must be present after reset."""
    reset_all()
    assert get("cont_near_ma_direction") == "above"
    options = next(r for r in SEED if r["key"] == "cont_near_ma_direction")["options"]
    assert sorted(options.split(",")) == ["above", "below", "both"]


def test_reset_all_restores_defaults(clean_db):
    reset_all()
    settings_set("price_min", "555")
    assert get("price_min") == 555        # number cast
    reset_category("scanner_base")
    assert get("price_min") == 100
    # other categories untouched by reset_category
    settings_set("max_positions", "7")
    reset_category("scanner_base")
    assert get("max_positions") == 7
    reset_all()
    assert get("max_positions") == 2


def test_get_get_all_as_dict_and_types(clean_db):
    reset_all()
    rows = get_all()
    assert len(rows) == len({r["key"] for r in rows})   # unique keys
    d = get_all_as_dict()
    assert d["max_positions"] == 2.0 or d["max_positions"] == 2
    assert d["paper_trading"] is True
    assert d["cont_near_ma_direction"] == "above"
    assert get("nope_missing") is None


def test_cast_value_matrix():
    assert _cast_value("true", "boolean") is True
    assert _cast_value("false", "boolean") is False
    assert _cast_value("1", "boolean") is True
    assert _cast_value("150", "number") == 150
    assert _cast_value("1.5", "number") == 1.5
    assert _cast_value("abc", "number") == "abc"         # cast failure → passthrough
    assert _cast_value("above", "select") == "above"
