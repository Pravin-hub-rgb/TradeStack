"""
Test script for Step 4: Bhavcopy Updater.
Verifies that bhavcopy download + cache update works end-to-end.

Usage:
  cd MA_Stock_Trader_NA
  backend/venv/Scripts/python tests/step4_bhavcopy_updater.py
"""

import sys
import shutil
from pathlib import Path
from datetime import date, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from src.cache_manager import cache_manager
from src.bhavcopy_updater import update_cache_for_date, find_cache_gaps, get_cache_dates

PASS = "[PASS]"
WARN = "[WARN]"

OLD_CACHE = Path(r"C:\Users\Pravin\Desktop\main\MA_Stock_Trader\data\cache")
TEST_STOCKS = ["20MICRONS", "360ONE", "3MINDIA"]


def setup():
    """Copy test stocks from old project cache."""
    for sym in TEST_STOCKS:
        src = OLD_CACHE / f"{sym}.pkl"
        if src.exists():
            shutil.copy2(src, cache_manager.cache_dir / f"{sym}.pkl")
    count = len(cache_manager.list_symbols())
    print(f"{PASS} setup ({count} stocks copied)")
    return count


def teardown():
    for sym in TEST_STOCKS:
        p = cache_manager.get_cache_path(sym)
        if p.exists():
            p.unlink()
    print(f"{PASS} teardown")


def test_cache_stats_before():
    stats = cache_manager.stats()
    assert stats["stock_count"] >= 1
    assert stats["total_size_mb"] > 0
    assert stats["latest_date"] is not None
    print(f"{PASS} test_cache_stats_before (count={stats['stock_count']}, latest={stats['latest_date']})")


def test_update_cache_for_date():
    """Try to update with a recent bhavcopy date."""
    # Find a recent weekday with data
    df = None
    used_date = None
    for i in range(10):
        d = date.today() - timedelta(days=i + 1)
        if d.weekday() < 5:
            from src.nse_fetcher import download_bhavcopy
            df = download_bhavcopy(d)
            if df is not None:
                used_date = d
                break

    if df is None or used_date is None:
        print(f"  {WARN} Skipping update test — could not download bhavcopy")
        return None

    old_latest = cache_manager.get_latest_cache_date()

    result = update_cache_for_date(used_date, batch_size=50)
    assert result["total_cached_stocks"] >= 1, "Should have cached stocks"
    assert result["bhavcopy_stocks"] > 500, "Should have bhavcopy data"
    assert result["duration_sec"] > 0, "Should take some time"

    new_latest = cache_manager.get_latest_cache_date()
    if old_latest and used_date > old_latest:
        assert new_latest == used_date, f"Latest date should be {used_date}, got {new_latest}"

    print(f"{PASS} test_update_cache_for_date ({used_date}: {result['updated']} updated, {result['skipped']} skipped in {result['duration_sec']}s)")
    return result


def test_update_idempotent():
    """Running update twice for the same date should skip existing data."""
    from src.nse_fetcher import download_bhavcopy
    from datetime import date, timedelta

    d = None
    for i in range(10):
        test = date.today() - timedelta(days=i + 1)
        if test.weekday() < 5:
            df = download_bhavcopy(test)
            if df is not None:
                d = test
                break

    if d is None:
        print(f"  {WARN} Skipping idempotent test")
        return

    result1 = update_cache_for_date(d)
    result2 = update_cache_for_date(d)

    assert result2["updated"] == 0, f"Second run should update 0, got {result2['updated']}"
    skipped_rate = result2["skipped"] / max(result2["total_cached_stocks"], 1)
    assert skipped_rate > 0.8, f"Most stocks should be skipped, got {result2['skipped']}/{result2['total_cached_stocks']}"
    print(f"{PASS} test_update_idempotent (0 updates on re-run)")


def test_find_cache_gaps():
    """find_cache_gaps should return missing trading days (list of dates)."""
    gaps = find_cache_gaps()
    assert isinstance(gaps, list)
    if gaps:
        for g in gaps:
            assert isinstance(g, date)
            assert g.weekday() < 5, f"Expected weekday, got {g}"
    print(f"{PASS} test_find_cache_gaps ({len(gaps)} gaps found)")


def test_get_cache_dates():
    """get_cache_dates should return sorted unique ISO date strings."""
    dates = get_cache_dates()
    assert isinstance(dates, list)
    assert len(dates) > 0
    assert isinstance(dates[0], str)
    assert dates == sorted(dates)
    print(f"{PASS} test_get_cache_dates ({len(dates)} unique dates)")


if __name__ == "__main__":
    print("=" * 50)
    print("Step 4: Bhavcopy Updater Tests")
    print("=" * 50)
    errors = []
    try:
        setup()
        test_cache_stats_before()
        test_update_cache_for_date()
        test_update_idempotent()
        test_find_cache_gaps()
        test_get_cache_dates()
    except Exception as e:
        errors.append(str(e))
        import traceback
        traceback.print_exc()
    finally:
        teardown()
    if errors:
        print(f"\n{WARN} {len(errors)} test(s) failed")
        sys.exit(1)
    print("=" * 50)
    print("All tests passed!")
    print("=" * 50)
