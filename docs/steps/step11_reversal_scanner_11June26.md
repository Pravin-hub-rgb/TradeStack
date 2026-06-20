# Step 11: Reversal Scanner — Build Notes

**Date:** 11 June 2026

## What We Built

### 1. Scanner Core — `backend/src/scanner.py`

**`ReversalScanner`** class extending the scanner module with decline-reversal pattern detection:

- **`_analyze_stock()`**: for each stock, iterates periods 3–15 (hardcoded `range(3, 16)` matching old `reversal_analyzer.py`), finds the best decline period where:
  - Price declines `>= min_decline_pct` over the period
  - At least 1 green day in the period (not all red)
  - Tracks best decline across all periods via `_find_best_decline_period()`
- **`_classify_trend_context()`**: computes `ma_5` at period end vs `ma_5_earlier` (50 calendar days before scan date) to classify as `"uptrend"` or `"downtrend"`
- **`_passes_filters()`**: price range check
- **Date pre-filter** (`_detect_scan_date()` + `_stock_has_date()`): gets latest date from first cached stock; skips stocks without that date (handles delisted/BE-switched stocks)
- **`get_default_reversal_params()`**: reads from Settings DB:
  - `rev_decline_days_min` (default `"3"`)
  - `rev_decline_days_max` (default `"15"`)
  - `rev_min_decline_pct` (default `"10"`)

### 2. API Endpoints — `backend/server.py`
- `POST /api/scanner/reversal` — accepts `{date, filters: {min_price, max_price, rev_min_decline_pct}}`. Reads `rev_decline_days_min`/`rev_decline_days_max` from Settings DB only (not overridable from frontend). Launches background scan via `_run_reversal_scan()`
- `GET /api/scanner/status/{operation_id}` — shared polling endpoint, same as continuation

### 3. Frontend — `frontend/src/components/ReversalScanner.tsx`
- **Filter controls**: Min Price (₹), Max Price (₹), Min Decline (%) — Decline Days min/max removed from UI (settings-only)
- **Run Scanner button**: amber gradient, disabled while scanning, progress bar with percentage
- **Results table**: 8 sortable columns — Symbol, Close, Period, Green Days, First Red, Decline %, Trend (Chip), ADR %. `decline_percent` displayed as `(row.decline_percent * 100).toFixed(1)%`
- **Checkbox selection**: select all / individual rows
- **Copy to clipboard**: Fyers format (`NSE:SYMBOL-EQ`) for selected or all rows
- **Export CSV**: browser download, decline_percent in decimal format matching old CSV
- **State persistence**: results stored in `AppStateContext` under `reversalResults` key, survives refresh via localStorage

### 4. Tests — `tests/step11_reversal_scanner.py`
**Tests pass, verify exact match with old codebase:**

- `settings defaults`: reads `rev_decline_days_min` (3) and `rev_decline_days_max` (15) from DB
- `reversal pattern detection`: synthetic data with known decline produces correct period, decline%, green days
- `best period selection`: among multiple decline periods, picks the one with highest decline%
- `filters work`: price filter correctly rejects out-of-range stocks
- `date pre-filter`: stocks without latest scan date are skipped
- `trend classification`: correctly identifies uptrend/downtrend based on MA shift
- `period 3-15 range`: matches old `reversal_analyzer.py` hardcoded `range(3, 16)`

## Critical Bugs Fixed During Development

### Bug 1: `decline_days_max` default was 8, not 15
- Settings DB had `rev_decline_days_max = "8"` but old code hardcodes `range(3, 16)` in `reversal_analyzer.py` (old `scanner.py`'s `decline_days: (3, 8)` param is never read by reversal logic)
- **Fix**: changed settings default to `"15"` in `backend/src/settings.py`

### Bug 2: No date pre-filter — wrong stocks included
- Stocks switched to BE series (DBREALTY, KRN, QPOWER, QUICKHEAL, STYLEBAAZA) or merged (GSPL) had stale data, producing false positives
- **Fix**: added `_detect_scan_date()` + `_stock_has_date()` to skip stocks missing latest trading day

### Bug 3: Trend window used full data instead of 50 calendar days
- `ma_5_earlier` was computed from the entire cached dataframe, giving old stocks an artificially low MA and biasing toward "uptrend"
- **Fix**: compute trend on `data.index >= pd.Timestamp(scan_date - timedelta(days=50))` window, matching old `get_data_for_date_range(symbol, scan_date-50, scan_date)`

### Bug 4: `decline_percent` stored as percentage instead of decimal
- Frontend was storing `13.0` instead of `0.13`, breaking display and CSV export
- **Fix**: round to 4 decimal places as decimal (`0.206` instead of `20.6`). Frontend multiplies by 100 for display: `{(row.decline_percent * 100).toFixed(1)}%`

### Bug 5: Settings persisted with incorrect keys
- Old `rev_decline_days_min`/`rev_decline_days_max` had different default values than expected
- **Fix**: corrected to `"3"` and `"15"` matching old code's actual behavior

## Changes to `frontend/src/components/ReversalScanner.tsx` (11 June 2026)
- Removed `declineMin`/`declineMax` state variables and their `useState` declarations
- Removed `useEffect` for `rev_declineMin`/`rev_declineMax` localStorage persistence
- Removed Decline Days (min/max) input fields from the filter controls grid
- Removed `rev_decline_days_min`/`rev_decline_days_max` from the POST request body
- Backend still reads these from Settings DB defaults — not overridable from frontend

## 25 Stocks Match Old Exactly

With `min_decline=13%`, `decline_days_max=15`:

| Symbol | Close | Period | Decline % | Trend | ADR % |
|--------|-------|--------|-----------|-------|-------|
| AVANTIFEED | 575.75 | 8 | 13.34% | uptrend | 4.5 |
| DCAL | 156.59 | 5 | 13.72% | downtrend | 5.2 |
| DCXINDIA | 256.70 | 8 | 13.02% | uptrend | 4.7 |
| EIEL | 98.77 | 7 | 20.41% | uptrend | 3.5 |
| GESHIP | 1129.50 | 9 | 18.06% | uptrend | 3.4 |
| GMDCLTD | 358.65 | 4 | 17.31% | uptrend | 5.0 |
| GREENLAM | 519.80 | 5 | 14.22% | uptrend | 5.2 |
| GRMOVER | 199.29 | 7 | 16.16% | downtrend | 4.1 |
| HIKAL | 335.50 | 8 | 14.77% | uptrend | 3.4 |
| JAINREC | 99.21 | 5 | 16.77% | uptrend | 3.9 |
| LAXMIDENTL | 470.05 | 4 | 14.33% | uptrend | 5.0 |
| MANINDS | 338.75 | 7 | 14.38% | uptrend | 3.9 |
| MARINE | 189.55 | 5 | 13.00% | uptrend | 5.0 |
| MEESHO | 186.85 | 6 | 13.42% | uptrend | 4.4 |
| NATCOPHARM | 1447.45 | 7 | 14.83% | uptrend | 3.4 |
| PROTEAN | 166.50 | 3 | 20.52% | uptrend | 4.5 |
| REDTAPE | 719.90 | 5 | 13.55% | uptrend | 5.3 |
| SKYGOLD | 25.36 | 11 | 21.12% | uptrend | 4.2 |
| SPARC | 251.72 | 6 | 13.67% | uptrend | 3.2 |
| SUDARSCHEM | 451.00 | 8 | 19.30% | uptrend | 4.5 |
| SUVEN | 99.39 | 5 | 20.57% | uptrend | 5.8 |
| TECHNOE | 726.30 | 5 | 15.10% | uptrend | 5.1 |
| VEDL | 531.25 | 3 | 16.24% | uptrend | 5.1 |
| WAKEFIT | 218.84 | 3 | 23.31% | uptrend | 4.7 |
| WOCKPHARMA | 660.80 | 5 | 14.76% | uptrend | 3.9 |

Identical to old CSV (Jun 9 13:07 scan).

## Why This Approach

| Decision | Why |
|----------|-----|
| Settings-only for decline days | User shouldn't tweak these per session — they define the scanning scope. Price and decline % are what users adjust. |
| Date pre-filter | Prevents stale/delisted stocks from appearing in results. Matches old `_get_all_cached_stocks_with_data` behavior. |
| 50-calendar-day trend window | Prevents data from months ago from skewing the short-term trend assessment. Matches old `get_data_for_date_range(symbol, scan_date-50, scan_date)`. |
| Decimal decline_percent in storage | Matches old CSV format. Frontend handles display conversion. |
| Background thread + polling | Same pattern as continuation scanner, bhavcopy, and Upstox downloader. Consistent UX. |

## Verification Steps

```powershell
# Run reversal scanner tests
cd MA_Stock_Trader_NA\backend
.\venv\Scripts\python ..\tests\step11_reversal_scanner.py

# Start servers
cd MA_Stock_Trader_NA
bun run dev

# Test API directly
curl -X POST http://localhost:8001/api/scanner/reversal ^
  -H "Content-Type: application/json" ^
  -d "{\"filters\": {\"min_price\": 100, \"max_price\": 2000, \"rev_min_decline_pct\": 10}}"
# → {"status":"started","operation_id":"scan_..."}

# Poll for results
curl http://localhost:8001/api/scanner/status/scan_...
# → {"status":"completed","progress":100,"result":{"count":N,"results":[...]}}
```

## Key Files
- `backend/src/scanner.py` — `ReversalScanner` class with date pre-filter, 50-calendar trend window, decimal decline_percent
- `backend/src/settings.py` — `rev_decline_days_min` (3), `rev_decline_days_max` (15), `rev_min_decline_pct` (10) defaults
- `backend/server.py` — `POST /api/scanner/reversal`, `GET /api/scanner/status/{id}`
- `frontend/src/components/ReversalScanner.tsx` — 3 filter controls (price min/max, decline %), copy/CSV/select, state via AppStateContext
- `frontend/src/lib/AppStateContext.tsx` — `ReversalResult` interface, `reversalResults` state, localStorage persistence
- `frontend/src/app/page.tsx` — renders `<ReversalScanner />` in Reversal tab

## 🎓 Learning From This Step

| Concept | What It Is | Suggested Learning Project | Focus Area |
|---------|-----------|---------------------------|------------|
| **Decline-reversal pattern** | Detecting stocks that have dropped X% over N days with green day confirmation | Build a simple "X% down in N days" screener for any market data | Period iteration, best-candidate selection |
| **Date pre-filtering** | Excluding stocks that lack data for the latest trading day (delisted/suspended) | Write a function that filters a stock list to only those with data on a given date | Robust date matching, edge cases |
| **Settings-only params** | Some scanner parameters are not overridable by the UI — they come from DB only | Build a dashboard with fixed (DB) vs adjustable (UI) parameter groups | Clean separation of concerns |
| **Old code comparison** | Reverse-engineering exact behavior from a legacy codebase | Pick any old Python script and rebuild it in a new language/framework — verify output matches | Precision matching, uncovering hidden assumptions |
| **Trend context window** | Computing MA shift over a bounded lookback (50 days) instead of all available data | Write a function that compares short-term MA at two timestamps within a sliding window | Window sizing, NaN handling, date alignment |
