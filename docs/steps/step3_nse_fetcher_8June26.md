# Step 3: NSE Bhavcopy Fetcher
## Date: 8 June 2026

---

## What We Built

The **NSE Bhavcopy Fetcher** — downloads NSE's end-of-day (EOD) bhavcopy CSV files and converts them into a standardized DataFrame ready for the cache manager.

### File Created

`backend/src/nse_fetcher.py` (~130 lines) with these public functions:

| Function | Description |
|----------|-------------|
| `download_bhavcopy(target_date)` | Download bhavcopy for a specific date. Returns standardized DataFrame with ~2000+ stocks or None. Uses 2-layer fallback. |
| `download_bhavcopy_for_range(start, end)` | Download bhavcopy for a date range. Returns a list of per-date results. |
| `get_stock_row(symbol, bhavcopy_df)` | Extract a single stock's row from the bhavcopy DataFrame. |
| `_standardize(df, target_date, source)` | Internal — converts raw NSE CSV columns to our standard format. |

### Fallback Strategy

| Layer | URL Pattern | Best For |
|-------|-------------|----------|
| 1. Direct UDiFF | `nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{yyyymmdd}_F_0000.csv.zip` | Post-2024 data (primary) |
| 2. Historical | `archives.nseindia.com/content/historical/EQUITIES/{year}/{month}/cm{ddMMMyyyy}bhav.csv.zip` | Older data |

### Standardized Output Format

| Column | Type | Example |
|--------|------|---------|
| `symbol` | string | `RELIANCE` |
| `open` | float | 1304.50 |
| `high` | float | 1320.00 |
| `low` | float | 1295.00 |
| `close` | float | 1315.75 |
| `volume` | int | 17785223 |

Index: `date` (DatetimeIndex) — all rows share the same date for a single day's bhavcopy.

---

## Why Separate From Cache Manager

The fetcher and cache manager have distinct responsibilities:

```
NSE Server → nse_fetcher.py (download + parse) → DataFrame
                                                        ↓
                                           cache_manager.py (store + update) → .pkl
```

This separation means:
- You can test downloading without touching cache files
- The fetcher can be swapped for alternative data sources (yfinance, Upstox API)
- The cache manager is pure local I/O — no network dependency

---

## Verification

```powershell
cd MA_Stock_Trader_NA
backend\venv\Scripts\python -c "
import sys; sys.path.insert(0, 'backend')
from src.nse_fetcher import download_bhavcopy
from datetime import date, timedelta

# Try to download recent data
for i in range(5):
    d = date.today() - timedelta(days=i+1)
    if d.weekday() < 5:
        df = download_bhavcopy(d)
        if df is not None:
            print(f'Downloaded {len(df)} stocks for {d}')
            print(f'Columns: {df.columns.tolist()}')
            print(f'Sample: {df.head(3)}')
            break
"
```

---

## Next Step

**Step 4: Bhavcopy Updater** — wire the fetcher to the cache manager. Download bhavcopy and update all cached stocks in one operation. Add batch processing with progress tracking.

---

## 🎓 Learning From This Step

| Concept Used | What It Is | Suggested Learning Project | Focus Area |
|---|---|---|---|
| **requests.Session** | Reusable HTTP client that keeps cookies and headers between requests. Essential for NSE which requires a session cookie. | Build a CLI that logs into a mock API, fetches data, and downloads a file | Session headers, cookies, connection reuse |
| **zipfile** | Python's built-in ZIP extraction. Bhavcopy files are distributed as ZIP archives containing a single CSV. | Write a script that downloads a ZIP, extracts all CSV files, and prints row counts | `ZipFile`, `namelist()`, `open()` within ZIP |
| **Fallback pattern** | Try multiple approaches in order until one succeeds. Each layer handles a different failure mode. | Write a file reader that tries UTF-8 first, then cp1252, then latin-1, and reports which worked | Error handling, graceful degradation, logging each attempt |
| **Column normalization** | Map different column naming conventions to a single standard. NSE changed column names in 2024 (UDiFF format). | Write a CSV normalizer that detects headers and maps them to standard names | Dict-based column mapping, set operations for missing columns |
