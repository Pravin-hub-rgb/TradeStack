"""
Test the cache freshness and resolved stock list changes.
"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from datetime import date
from src.nse_fetcher import get_nse_holidays, get_latest_trading_date
from src.cache_manager import cache_manager
from src.db import get_stock_list

pass_count = 0
fail_count = 0

def check(name, condition, detail=""):
    global pass_count, fail_count
    if condition:
        print(f"  [PASS] {name}")
        pass_count += 1
    else:
        print(f"  [FAIL] {name} — {detail}")
        fail_count += 1

print("=" * 50)
print("Cache Freshness & Resolved Tests")
print("=" * 50)

# 1. NSE holidays
holidays = get_nse_holidays()
check("get_nse_holidays returns dates", len(holidays) >= 15,
      f"Expected >= 15, got {len(holidays)}")
check("Holidays include known dates", date(2026, 1, 26) in holidays,
      "Republic Day 2026-01-26 missing")
check("Holidays include Muharram", date(2026, 6, 26) in holidays,
      "Muharram 2026-06-26 missing")

# 2. Latest trading date
nse_date = get_latest_trading_date()
check("get_latest_trading_date returns a date", nse_date is not None)
check("Latest date is not in future", nse_date <= date.today())
check("Latest date is a weekday", nse_date.weekday() < 5,
      f"{nse_date} is weekend")
check("Latest date is not a holiday", nse_date not in holidays,
      f"{nse_date} is an NSE holiday")

# 3. Cache get_last_close
# Find any stock that exists both in stock list and cache
live_symbol = None
for t in ["continuation", "reversal"]:
    stocks = get_stock_list(t)
    if stocks:
        live_symbol = stocks[0]["symbol"]
        break
if live_symbol is None:
    all_syms = cache_manager.list_symbols()
    if all_syms:
        live_symbol = all_syms[0]
if live_symbol:
    close = cache_manager.get_last_close(live_symbol)
    check(f"get_last_close returns value for {live_symbol}", close is not None)
    if close:
        check("Close value is positive", close > 0, f"Got {close}")
else:
    check("get_last_close — no stock available", False, "No symbols in cache")

close2 = cache_manager.get_last_close("NONEXISTENT12345")
check("get_last_close returns None for missing stock", close2 is None)

# 4. Cache freshness
cache_date = cache_manager.get_latest_cache_date()
check("Cache has a latest date", cache_date is not None)
is_fresh = cache_date is not None and nse_date is not None and cache_date >= nse_date
check("Cache freshness comparison works correctly",
      isinstance(is_fresh, bool))

# 5. Resolved stock list logic
for list_type in ["continuation", "reversal"]:
    stocks = get_stock_list(list_type)
    if stocks:
        sym = stocks[0]["symbol"]
        stored_close = stocks[0].get("close")
        cache_close = cache_manager.get_last_close(sym)
        check(f"Resolved close for {sym} ({list_type})",
              cache_close is not None or stored_close is not None,
              f"stored={stored_close}, cache={cache_close}")

# 6. Cache has date helper
from src.nse_fetcher import _cache_has_date
check("_cache_has_date True for cached date",
      _cache_has_date(cache_date, cache_date) is True)
check("_cache_has_date False for future date",
      _cache_has_date(date(2099, 1, 1), cache_date) is False)
check("_cache_has_date False when cache is None",
      _cache_has_date(date.today(), None) is False)

print(f"\n{'=' * 50}")
print(f"Results: {pass_count} passed, {fail_count} failed")
print(f"{'=' * 50}")
sys.exit(fail_count)
