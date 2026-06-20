# Step 7: Technical Indicators Module

**Date:** 08 Jun 2026
**Phase:** Phase 1 (Indicators & Data Processing)

---

## What We Built

A pure-function Python module `backend/src/indicators.py` that computes all technical indicators needed by the scanner system. Exact formulas match the old codebase at `MA_Stock_Trader/src/utils/data_fetcher.py`.

### Files Created

| File | Purpose |
|------|---------|
| `backend/src/indicators.py` | 11 indicator functions, all pure (no side effects) |
| `tests/step7_indicators.py` | 31 tests (real data + synthetic) |

### Functions

| Function | What It Does | Used By |
|----------|-------------|---------|
| `calc_sma(data, period=20)` | Simple Moving Average of close | Scanner (continuation/reversal) |
| `calc_adr(data, period=14)` | Average Daily Range as % of close | ADR threshold filter |
| `calc_adr_absolute(data, period=14)` | ADR in Rupees | Position sizing |
| `calc_ma_angle(ma_series)` | MA slope in degrees via linear regression (5-point) | Continuation strength check |
| `calc_price_change(data, periods)` | 1d/5d/20d percentage returns | Scanner trend detection |
| `calc_high_low_distances(data, period=20)` | Distance from 20d high/low | Reversal scanner |
| `compute_all_indicators(data)` | Runs all above, returns DataFrame with new columns | Bulk processing |
| `check_price_range(close, min, max)` | Price filter (default 100-2000) | Base filter |
| `check_adr_threshold(adr_pct, min=3.0)` | ADR >= 3% | Base filter |
| `check_liquidity(data, ...)` | Days with volume >= 1M AND movement >= 5% | Base filter |
| `check_rising_ma(data)` | Current SMA20 > max of previous 5 | Continuation filter |
| `detect_volume_surge(data, threshold=1.5)` | Last volume > MA * threshold | Volume confirmation |
| `near_sma(data, threshold=5%, above_only=True)` | Close near/above SMA20 | Continuation setup |
| `check_base_filters(data, ...)` | Runs all base filters, returns (bool, reason) | Scanner entry point |

### Key Formulas (exact match to old codebase)

```
SMA20  = close.rolling(20).mean()
ADR%   = (high - low).rolling(14).mean() / close * 100
MA angle = degrees(arctan(slope)) where slope = polyfit([0,1,2,3,4], ma[-5:], 1)[0]
Liquidity = count of days in last 30 with
    volume >= 1,000,000 AND abs(close-open)/open >= 0.05 >= 2
Rising MA = current_sma20 > previous_5_days_sma20.max()
```

### Design Decisions

1. **Pure functions with pandas Series/DataFrame in/out** — easy to test, compose, reuse across scanner types.
2. **No state, no config** — all parameters passed explicitly. Config binding happens in the scanner layer.
3. **`compute_all_indicators()` as convenience** — returns a single DataFrame with all indicator columns, matching old `calculate_technical_indicators()`.
4. **`check_base_filters()` returns (bool, reason)** — enables UI to show *why* a stock was filtered out.

---

## Verification

```powershell
cd MA_Stock_Trader_NA
backend\venv\Scripts\python tests\step7_indicators.py
```

**Test categories:**

| Test Group | Count | What It Verifies |
|-----------|-------|-----------------|
| Real data (20MICRONS) | 6 | SMA20, ADR%, rising MA, near SMA, volume surge, liquidity |
| Columns created | 10 | All expected indicator columns exist after `compute_all_indicators()` |
| Price range / ADR threshold | 7 | Boundary conditions (exact min, max, below, above) |
| Synthetic exact values | 8 | Exact SMA20 arithmetic, ADR% range, liquidity with thresholds, volume surge conditions |

### Running With Fresh Cache

To reproduce exact real-data results:
```powershell
# Ensure cache is up to date first
backend\venv\Scripts\python tests\step5_data_api.py  # update bhavcopy
backend\venv\Scripts\python tests\step7_indicators.py
```

---

## How It Connects

```
Step 5 (Data API) ──> Step 7 (Indicators) ──> Step 8 (Continuation Scanner)
                         │                           │
                    cache_manager.py           filters.py (old code)
                    bhavcopy_updater.py         scanner logic
```

The scanner (Step 8+) will:
1. Load cached data via `cache_manager`
2. Compute indicators via `compute_all_indicators(data)`
3. Apply filters via `check_base_filters()`, `check_rising_ma()`, etc.
4. Return results to the API

---

## 🎓 Learning From This Step

| Technology | What It Is | Suggested Learning Project | Focus Area |
|-----------|-----------|--------------------------|------------|
| `pandas.Series.rolling()` | Rolling window calculations | Compute 50-day SMA for any stock | Window alignment, NaN handling |
| `numpy.polyfit()` | Linear regression over 5 points | Plot slope vs price for a trending stock | `np.polyfit` vs `scipy.stats.linregress` |
| `pd.DataFrame.pct_change()` | Period-over-period returns | Compute daily/weekly/monthly returns | Multi-period return aggregation |
| Arithmetic series sum | SMA = sum(window)/count | Verify SMA computation with pencil + paper | Off-by-one indexing (window vs current) |
| Pure function pattern | Functions with no side effects | Rewrite any impure function as pure | Testability, composability |
| `assert_close(tol)` | Floating-point tolerance testing | Test with float matrix operations | `np.isclose()` vs manual tolerance |
