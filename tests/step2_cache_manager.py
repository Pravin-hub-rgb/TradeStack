"""
Test script for Step 2: Cache Manager.
Verifies that cache_manager can load/save/update .pkl files correctly.

Usage:
  cd MA_Stock_Trader_NA
  backend/venv/Scripts/python tests/step2_cache_manager.py
"""

import sys
import shutil
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from src.cache_manager import cache_manager

OLD_CACHE = Path(r"C:\Users\Pravin\Desktop\main\MA_Stock_Trader\data\cache\20MICRONS.pkl")
TEST_SYMBOL = "20MICRONS"
PASS = "[PASS]"


def check_old_cache():
    if not OLD_CACHE.exists():
        return False
    dest = cache_manager.get_cache_path(TEST_SYMBOL)
    if not dest.exists():
        shutil.copy2(OLD_CACHE, dest)
    return True


def test_load_empty_cache():
    _non_existent = cache_manager.load("ZZZZXXX")
    assert _non_existent is None
    stats = cache_manager.stats()
    assert isinstance(stats["stock_count"], int)
    assert isinstance(stats["total_size_mb"], float)
    print(f"{PASS} test_load_empty_cache")


def test_load_from_old_cache():
    if not check_old_cache():
        print("  [SKIP] old cache file not found")
        return
    data = cache_manager.load(TEST_SYMBOL)
    assert data is not None
    assert not data.empty
    assert "close" in data.columns
    assert "volume" in data.columns
    assert len(data) == 221
    assert str(data.index[0].date()) == "2025-07-11"
    assert str(data.index[-1].date()) == "2026-06-04"
    print(f"{PASS} test_load_from_old_cache ({len(data)} rows)")


def test_get_last_date():
    if not check_old_cache():
        print("  [SKIP] old cache file not found")
        return
    assert str(cache_manager.get_last_date(TEST_SYMBOL)) == "2026-06-04"
    print(f"{PASS} test_get_last_date")


def test_latest_cache_date():
    if not check_old_cache():
        print("  [SKIP] old cache file not found")
        return
    assert cache_manager.get_latest_cache_date() == date(2026, 6, 4)
    print(f"{PASS} test_latest_cache_date")


def test_needs_update():
    if not check_old_cache():
        print("  [SKIP] old cache file not found")
        return
    assert cache_manager.needs_update(TEST_SYMBOL, max_age_days=10) == False
    print(f"{PASS} test_needs_update")


def test_stats():
    if not check_old_cache():
        print("  [SKIP] old cache file not found")
        return
    stats = cache_manager.stats()
    assert stats["stock_count"] >= 1
    assert stats["total_size_mb"] > 0
    print(f"{PASS} test_stats (count={stats['stock_count']}, size={stats['total_size_mb']}MB)")


def test_list_symbols():
    if not check_old_cache():
        print("  [SKIP] old cache file not found")
        return
    assert TEST_SYMBOL in cache_manager.list_symbols()
    print(f"{PASS} test_list_symbols")


def test_get_date_range():
    if not check_old_cache():
        print("  [SKIP] old cache file not found")
        return
    filtered = cache_manager.get_date_range(TEST_SYMBOL, start=date(2025, 7, 1), end=date(2025, 7, 31))
    assert len(filtered) == 15
    print(f"{PASS} test_get_date_range ({len(filtered)} days)")


def test_save_and_load_cycle():
    import pandas as pd
    test_data = pd.DataFrame({
        "open": [100.0, 101.0],
        "high": [102.0, 103.0],
        "low": [99.0, 100.0],
        "close": [101.0, 102.0],
        "volume": [10000, 15000],
    }, index=pd.to_datetime(["2026-06-01", "2026-06-02"]))
    cache_manager.save("_TEST_STOCK", test_data)
    loaded = cache_manager.load("_TEST_STOCK")
    assert loaded is not None and len(loaded) == 2
    assert loaded.loc[loaded.index[0], "close"] == 101.0
    cache_manager.get_cache_path("_TEST_STOCK").unlink(missing_ok=True)
    print(f"{PASS} test_save_and_load_cycle")


def cleanup():
    path = cache_manager.get_cache_path(TEST_SYMBOL)
    if path.exists():
        path.unlink()
        print(f"{PASS} cleanup")


if __name__ == "__main__":
    print("=" * 50)
    print("Step 2: Cache Manager Tests")
    print("=" * 50)
    try:
        test_load_empty_cache()
        test_load_from_old_cache()
        test_get_last_date()
        test_latest_cache_date()
        test_needs_update()
        test_stats()
        test_list_symbols()
        test_get_date_range()
        test_save_and_load_cycle()
    finally:
        cleanup()
    print("=" * 50)
    print("All tests passed!")
    print("=" * 50)
