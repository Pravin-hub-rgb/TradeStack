# Step 18: Cache Freshness Check & Resolved Stock List

**Date:** 19 Jun 2026
**Phase:** Live Trading (Stale Data Fix)

---

## What We Built

Two interconnected fixes solving the **cache data inconsistency** bug where:
1. **previousClose was frozen** — stocks added to the trading list before a bhavcopy update kept old close values forever
2. **No stale-cache warning** — user could start Live Trading with outdated bhavcopy data without any warning

### Bug 1: Frozen `previousClose`

**Root cause:** When user clicks `+` in scanner results, `close` is saved to `stock_list_items` table in SQLite as a **snapshot**. When bhavcopy updates later, the stored `close` never changes. `LiveTrading.tsx` read `s.close` from this frozen table at start time.

**Evidence:** Adani Power (added after bhavcopy update) had correct close, while RespondInd and Moship (added before update) had stale close values from 17 June.

**Fix:** New `/resolved` endpoint reads latest close from cache `.pkl` files at runtime, ignoring the frozen SQLite value.

### Bug 2: No Stale-Cache Warning

**Root cause:** Clicking Start Trading did not check whether cache data is current compared to what NSE has published.

**Fix:** Pre-start validation compares latest cache date vs latest NSE trading date using NSE's official holiday API. If stale, a warning dialog appears.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/nse_fetcher.py` | Added `get_nse_holidays()`, `get_latest_trading_date()`, `_cache_has_date()`. Optimized with cache-first strategy. |
| `backend/src/cache_manager.py` | Added `get_last_close(symbol)` — returns latest close from `.pkl`, handles NaN. |
| `backend/server.py` | Added `GET /api/data/cache-freshness` and `GET /api/stock-list/{list_type}/resolved` endpoints. |
| `frontend/src/components/LiveTrading.tsx` | Uses `/resolved` endpoint. Added freshness fetch on mount, cache date badge, stale warning dialog. |
| `tests/stepX_cache_freshness.py` | 17 tests covering holidays, trading dates, cache close, resolved list, freshness. |

---

## Architecture

### Freshness Check Flow

```
User opens Live Trading page
  → Frontend fetches GET /api/data/cache-freshness
    → Python compares:
        cache_manager.get_latest_cache_date()   (from SQLite cache_index table)
        vs
        get_latest_trading_date()                (from NSE holiday API + bhavcopy probe)
    → Returns { is_fresh, latest_cache_date, latest_nse_date, days_behind, message }
  → If stale: show ⚠️ badge in market times row
  → If user clicks Start Trading while stale → warning dialog
```

### Resolved Stock List Flow

```
User clicks Start Trading
  → Frontend fetches GET /api/stock-list/{list_type}/resolved
    → Python:
        1. Gets stock list from SQLite (symbol + params only)
        2. For each symbol, cache_manager.get_last_close(symbol) → from .pkl
        3. Replaces close with cache value (falls back to stored close if cache unavailable)
    → Returns { stocks: [{symbol, close, ...}, ...] }
  → Frontend uses s.close as previousClose — always current
```

### NSE Trading Date Detection (Two-Pass Strategy)

```
get_latest_trading_date():
  holidays = get_nse_holidays()            # NSE holiday API, 24h cache
  latest_cache = cache_manager.get_latest_cache_date()

  for offset in 1..10:                      # Max 10 days lookback
    d = today - offset
    if weekend: continue
    if holiday: continue

    # Fast path: already in cache, no HTTP
    if d <= latest_cache: return d

    # Slow path: probe bhavcopy download
    if download_bhavcopy(d) succeeds: return d

  return None
```

### NSE Holiday API

```
Endpoint: https://www.nseindia.com/api/holiday-master?type=trading
Response: { "CM": [{"tradingDate": "15-Jan-2026", ...}, ...] }
Cache: 24 hours (in-memory module-level variable)
```

2026 returns 20 holidays (Republic Day, Holi, Good Friday, Muharram, Diwali, Christmas, etc.).

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Cache-first in `get_latest_trading_date` | Avoids HTTP bhavcopy download on every page load. Normal case (cache is up-to-date): instant. |
| NSE holiday API over third-party lib | Zero-dependency, official source, auto-updates every year, no pip install needed. |
| `/resolved` endpoint instead of modifying `/stock-list` | Backward compatible — existing code unaffected. |
| Reuse `_session()` from nse_fetcher | Consistent User-Agent + cookie handling matching bhavcopy downloads. |
| `get_last_close` returns `Optional[float]` | Handles missing stocks, empty cache, NaN values cleanly. |
| Dialog with [Start Anyway] | User can proceed with stale data if they choose (e.g., no internet connection). |

---

## Commands Used

```powershell
# Test NSE holidays
cd MA_Stock_Trader_NA
backend\venv\Scripts\python -c "import sys; sys.path.insert(0, 'backend'); from src.nse_fetcher import get_nse_holidays; print(f'Holidays: {len(get_nse_holidays())}')"

# Test latest trading date
backend\venv\Scripts\python -c "import sys; sys.path.insert(0, 'backend'); from src.nse_fetcher import get_latest_trading_date; print(get_latest_trading_date())"

# Run full test suite
backend\venv\Scripts\python tests\stepX_cache_freshness.py

# Run cache manager tests
backend\venv\Scripts\python tests\step2_cache_manager.py

# TypeScript type check
cd frontend && npx tsc --noEmit
```

---

## Verification

1. Start the server (`bun run dev`)
2. Open Live Trading page → cache date badge appears in market times row
3. If cache is stale, clicking "Start Trading" shows warning dialog
4. Click "Start Anyway" → bot starts with current cache's previousClose values
5. Add a new stock to trading list → update bhavcopy → start bot → new stock has correct close, old stocks also have correct close (from cache, not frozen)

---

## 🎓 Learning From This Step

| Concept | What It Is | Learning Project |
|---------|-----------|-----------------|
| NSE Holiday API | Official NSE JSON endpoint listing all trading holidays per year | Write a script that prints "is market open?" for any given date |
| Lazy import | Importing a module inside a function body to avoid circular deps | Write a utility module that conditionally imports optional dependencies |
| In-memory cache with TTL | Storing fetched data with a timestamp, refreshing after expiry | Build a weather app that caches API responses for 5 minutes |
| Two-pass lookup | Fast path (local) first, fallback to slow path (network) | Build a currency converter that checks local rates file first, then API |
| Dialog with 3 actions | Cancel / Start Anyway / Go Fix — gives user choice | Add confirmation dialogs to any delete action |
| `pd.isna()` guard | Prevent NaN values from breaking JSON serialization | Add NaN checks to any data pipeline that feeds a REST API |
