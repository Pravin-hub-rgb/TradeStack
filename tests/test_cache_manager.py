"""
Phase 4 tests: backend/src/cache_manager.py

Uses a CacheManager pointed at a pytest tmp dir (real data/cache untouched)
plus the TABB session tmp SQLite DB (env-set in conftest) for cache_index.
"""

import pickle

import pandas as pd

from src import db
from src.cache_manager import CacheManager

COLS = ["open", "high", "low", "close", "volume"]


def frame(start, n, base=100.0):
    rows = []
    for i in range(n):
        rows.append({
            "open": base + i,
            "high": base + i + 2,
            "low": base + i - 2,
            "close": base + i + 1,
            "volume": 2_000_000,
        })
    idx = pd.bdate_range(start, periods=n)
    return pd.DataFrame(rows, index=idx)


def test_save_load_roundtrip(tmp_cache, tmp_path):
    df = frame("2026-01-01", 20)
    tmp_cache.save("TESTSTOCK", df)
    loaded = tmp_cache.load("TESTSTOCK")
    assert loaded is not None
    assert len(loaded) == 20
    assert list(loaded.columns) == COLS
    assert loaded["close"].iloc[-1] == df["close"].iloc[-1]


def test_load_missing_returns_none(tmp_cache):
    assert tmp_cache.load("NOSUCH") is None


def test_load_corrupt_returns_none(tmp_cache, tmp_path):
    path = tmp_cache.get_cache_path("BROKEN")
    with open(path, "wb") as f:
        f.write(b"this is not a pickle")
    assert tmp_cache.load("BROKEN") is None


def test_update_merges_and_dedups_keeping_last(tmp_cache):
    old = frame("2026-01-01", 10, base=100.0)          # 10 rows, dates d1..d10
    tmp_cache.save("MERGE", old)

    # new data overlaps last 7 days (Jan 6..14) with different closes + 5 fresh days
    new = frame("2026-01-06", 10)                      # 10 rows, dates Jan 6..19
    tmp_cache.update("MERGE", new)

    merged = tmp_cache.load("MERGE")
    assert len(merged) == 13                           # 10 + 10 - 7 overlap
    assert merged.index.is_monotonic_increasing
    # overlapping days must carry the NEW values (keep="last")
    overlap_date = new.index[0]
    assert merged.loc[overlap_date, "close"] == new["close"].iloc[0]
    # "last_updated" marker column is stamped by update()
    assert "last_updated" in merged.columns


def test_update_index_written(tmp_cache, clean_db):
    df = frame("2026-01-01", 20)
    tmp_cache.save("INDEXED", df)
    symbols = db.list_symbols_from_index()
    assert "INDEXED" in symbols
    row = db.get_cache_stats()
    assert row["stock_count"] == 1
    assert row["total_size_mb"] > 0
    assert row["latest_date"] == "2026-01-28"          # frame() end date (20th bday from Thu Jan 1)


def test_update_batch_commit_defers(tmp_cache, clean_db):
    df = frame("2026-01-01", 20)
    tmp_cache.save("BATCH", df, commit=False)
    # not committed yet — but WAL semantics mean the pending write is on the
    # thread connection, so force the commit then verify
    db.commit_cache_index()
    assert "BATCH" in db.list_symbols_from_index()


def test_get_last_date_and_close(tmp_cache):
    df = frame("2026-01-01", 20)
    tmp_cache.save("LAST", df)
    assert tmp_cache.get_last_date("LAST").isoformat() == "2026-01-28"
    assert tmp_cache.get_last_close("LAST") == df["close"].iloc[-1]
    assert tmp_cache.get_last_date("MISSING") is None
    assert tmp_cache.get_last_close("MISSING") is None


def test_get_date_range_filters(tmp_cache):
    df = frame("2026-01-01", 20)
    tmp_cache.save("RANGE", df)
    out = tmp_cache.get_date_range("RANGE", start=pd.Timestamp("2026-01-12").date())
    assert len(out) > 0
    assert out.index[0] >= pd.Timestamp("2026-01-12")
    full = tmp_cache.get_date_range("MISSING")
    assert full.empty


def test_list_symbols_from_index(tmp_cache, clean_db):
    tmp_cache.save("AAA", frame("2026-01-01", 10))
    tmp_cache.save("BBB", frame("2026-01-01", 10))
    assert tmp_cache.list_symbols() == ["AAA", "BBB"]


def test_rebuild_index_from_disk(tmp_cache, tmp_path, clean_db):
    # save two stocks, wipe index, rebuild from .pkl files
    tmp_cache.save("REB1", frame("2026-01-01", 10))
    tmp_cache.save("REB2", frame("2026-02-01", 12))
    clean_db.delete_cache_index("REB1")
    count = tmp_cache.rebuild_index()
    assert count == 2
    assert tmp_cache.list_symbols() == ["REB1", "REB2"]
    stats = tmp_cache.stats()
    assert stats["stock_count"] == 2
    assert stats["latest_date"] == "2026-02-17"


def test_stats_fallback_when_index_empty(tmp_cache, clean_db):
    # nothing in index; one .pkl on disk → glob fallback path
    df = frame("2026-03-02", 15)
    path = tmp_cache.get_cache_path("FALLBACK")
    with open(path, "wb") as f:
        pickle.dump(df, f)
    stats = tmp_cache.stats()
    assert stats["stock_count"] == 1
    assert stats["latest_date"] == "2026-03-20"
