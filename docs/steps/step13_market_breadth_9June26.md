# Step 13: Market Breadth Analyzer

**Date:** 9 June 2026

## What We Built

Market breadth analysis — counts 8 metrics per trading day across all cached stocks, displayed as a color-coded table. Exact copy of old system logic, formulas, and frontend color scheme.

### The 8 Metrics (per date)

| # | Metric | Formula | Threshold |
|---|--------|---------|-----------|
| 1 | `up_4_5` | `price_change >= 0.045` | 4.5% daily gain |
| 2 | `down_4_5` | `price_change <= -0.045` | 4.5% daily loss |
| 3 | `up_20_5d` | `price_change_5d >= 0.20` | 20% gain in 5 days |
| 4 | `down_20_5d` | `price_change_5d <= -0.20` | 20% loss in 5 days |
| 5 | `above_20ma` | `close >= ma_20` | Price above 20-day SMA |
| 6 | `below_20ma` | `close < ma_20` | Price below 20-day SMA |
| 7 | `above_50ma` | `close >= ma_50` (on-the-fly) | Price above 50-day SMA |
| 8 | `below_50ma` | `close < ma_50` (on-the-fly) | Price below 50-day SMA |

### Files Created

| File | Purpose |
|------|---------|
| `backend/src/market_breadth.py` | Breadth calculator + cache manager (222 lines) |
| `frontend/src/components/MarketBreadth.tsx` | Color-coded breadth table with MUI Table (py:2px), matching old UI exactly |
| `frontend/src/app/breadth/page.tsx` | Route page (updated from placeholder) |

### Files Modified

| File | Change |
|------|--------|
| `backend/server.py` | Added 2 endpoints + background runner + import |

### Backend: `backend/src/market_breadth.py`

1. **`BreadthCacheManager`** — persist/load breadth results from `data/breadth_cache/breadth_data.pkl` (pickle dict keyed by date string)
   - `needs_update()` — dates within 7 days always recalculated, older from cache
   - `update_breadth_cache()` — saves after each date calculation (partial results survive crash)

2. **`calculate_breadth()`** — main function:
   - Loads all `.pkl` cache files (max 2000 stocks)
   - Collects union of all weekday dates across stocks
   - Loads cached results for old dates, calculates new dates only
   - After main calculation, forces calculation for last 7 weekdays
   - Progress callback for polling: 5%→25% loading stocks, 30%→40% loading cache, 50%→90% calculating, 100% done
   - Min 100 stocks must have data for a date to count

3. **`_calculate_date_breadth()`** — per-date logic (exact copy of old):
   - Checks `price_change`, `price_change_5d`, `close`, `ma_20` columns
   - Computes 50MA on-the-fly from last 50 rows of `close`
   - Requires columns already exist in cached data (set by Step 7 indicators)
   - Returns empty dict if fewer than 100 stocks have data for that date

### Backend: Server Endpoints

| Endpoint | Method | Returns |
|---|---|---|
| `/api/breadth/data` | GET | `{data: [...], total_dates: N, last_updated: "ISO"}` |
| `/api/breadth/update` | POST | `{status: "started", operation_id: "..."}` (background thread, poll via `/api/scanner/status/{id}`) |

### Frontend: `MarketBreadth.tsx`

- **MUI components**: Uses `<Table>`, `<TableBody>`, `<TableCell>`, `<TableContainer>`, `<TableHead>`, `<TableRow>` instead of native HTML tables — ensures consistent spacing with rest of app
- **Compact cells**: All data cells use `py: '2px'` (minimal vertical padding) to match old UI cell height exactly. Old version used `padding: "4px 6px"` which made rows too tall.
- **Row hover**: `"&:hover": { backgroundColor: "rgba(255,255,255,0.02)" }` on every row
- **Status Card**: shows "X dates cached" + last updated timestamp + Update button
- **Color-coded table**: 9 columns (Date + 8 metrics). Each cell has background color based on value ranges:

| Column | Ranges → Color |
|--------|---------------|
| **Up 4.5%** | <50→`#ff7300`, 50-69→`#ff9900`, 70-89→`#ffcd00`, 90-109→`#eee418`, 110-129→`#cae627`, 130-149→`#7ec019`, 150+→`#2A9915` |
| **Down 4.5%** | <35→`#2A9915`, 35-49→`#7ec019`, 50-65→`#eee418`, 66-99→`#ffcd00`, 100+→`#ff7300` |
| **Up 20% 5d** | <25→`#ff7300`, 25-37→`#FF8C00`, 38-50→`#32CD32`, 50+→`#2A9915` |
| **Down 20% 5d** | <20→`#ffffff`, 20-29→`rgba(255,187,102,0.6)`, 30-50→`rgba(255,140,0,0.4)`, 50+→`#ff7300` |
| **Above 20MA** | <200→`#ff7300`, 200-499→`#ff9900`, 500-799→`#ffcd00`, 800-899→`#eee418`, 900-1199→`#cae627`, 1200-1399→`#7ec019`, 1400+→`#2A9915` |
| **Below 20MA** | Flipped: <200→`#2A9915` ... 1400+→`#ff7300` |
| **Above 50MA** | Same as Above 20MA |
| **Below 50MA** | Same as Below 20MA |

- **Update button** uses same background thread + polling pattern as scanner
- **Progress bar** during calculation
- **Empty state** when no data cached

### 50MA Computation

Unlike the other 7 metrics which read pre-computed columns, the 50-day MA is calculated **on-the-fly** per stock per date:

```python
if len(df) >= 50:
    date_idx = pd.Timestamp(target_date)
    if date_idx in df.index:
        end_idx = df.index.get_loc(date_idx)
        if end_idx >= 49:
            ma_50_window = df.iloc[end_idx-49:end_idx+1]["close"].mean()
            if close >= ma_50_window:
                counts["above_50ma"] += 1
            else:
                counts["below_50ma"] += 1
```

This matches the old code exactly — it uses the last 50 closing prices up to and including the target date.

## Verification

```powershell
# Run tests
cd MA_Stock_Trader_NA\backend
.\venv\Scripts\python ..\tests\step13_market_breadth.py

# Check breadth data via API
curl http://localhost:8001/api/breadth/data
# → {"data":[{"date":"2026-06-08","up_4_5_pct":33,...}], "total_dates":222, "last_updated":"..."}

# Update breadth data
curl -X POST http://localhost:8001/api/breadth/update
# → {"status":"started","operation_id":"breadth_..."}
```

## Test Results

**6 tests pass:**
- `test_breadth_cache_manager` — cache manager initializes
- `test_cache_update_and_get` — update and retrieve cached values
- `test_date_breadth_with_synthetic` — synthetic data produces correct counts
- `test_calculate_breadth_runs` — full calculation runs on real data (~222 dates)
- `test_server_endpoints` — GET returns cached data, POST starts update

## Learning From This Step

| Concept | What It Is |
|---------|-----------|
| **Market breadth** | Counting stocks meeting technical conditions per day to gauge overall market strength |
| **50MA on-the-fly** | Computing a 50-day moving average from raw price data during analysis rather than pre-computing it |
| **Date union across stocks** | Finding all unique dates present across thousands of stock DataFrames |
| **Cache with partial save** | Saving per-date results as they're calculated (survives interruption) |
| **Color-coded thresholds** | Visual encoding of numeric ranges using carefully tuned color gradients |
