# Step 4: Bhavcopy Updater
## Date: 8 June 2026

---

## What We Built

The **Bhavcopy Updater** — wires the NSE fetcher to the cache manager. Downloads bhavcopy for a given date and merges it into every cached stock's `.pkl` file. Also detects and fills gaps in cache data.

### File Created

`backend/src/bhavcopy_updater.py` (~100 lines) with these functions:

| Function | Description |
|----------|-------------|
| `update_cache_for_date(target_date)` | Download bhavcopy for one date, update all cached stocks. Returns stats dict. |
| `find_cache_gaps()` | List trading days between latest cache date and today that are missing. |
| `fill_cache_gaps()` | Fill all missing dates automatically. Returns per-date stats. |
| `get_cache_dates()` | Sorted list of all unique dates present across all cached stocks. |

### Update Flow

```
1. list_symbols() → get all cached stock names
2. download_bhavcopy(target_date) → get bhavcopy with 2000+ stocks
3. For each cached stock:
   a. Look up symbol in bhavcopy DataFrame
   b. If found AND date not already in cache → create single-row DataFrame
   c. cache_manager.update(symbol, stock_df) → merge into .pkl
4. Report stats: updated, skipped, failed, not_in_bhavcopy
```

### Stats Returned

```python
{
    "date": "2026-06-05",
    "updated": 3,              # stocks successfully updated
    "skipped": 0,              # stocks that already had this date
    "failed": 0,               # stocks that errored during update
    "not_in_bhavcopy": 0,      # cached stocks not found in bhavcopy
    "total_cached_stocks": 3,
    "bhavcopy_stocks": 2443,
    "duration_sec": 0.5,
    "success_rate": 100.0
}
```

---

## Why This Matters

The updater is the **critical integration** between raw NSE data and usable stock cache:

```
nse_fetcher.py → raw bhavcopy DataFrame
                       ↓
bhavcopy_updater.py → merge into per-stock cache
                       ↓
cache_manager.py → .pkl files on disk
```

Once this works, the cache stays updated with a single API call. The scanner, market breadth, and all downstream analysis read from the same cache.

---

## Verification

```powershell
cd MA_Stock_Trader_NA
backend\venv\Scripts\python -c "
import sys; sys.path.insert(0, 'backend')
import shutil; from pathlib import Path
from src.cache_manager import cache_manager
from src.bhavcopy_updater import update_cache_for_date, find_cache_gaps

# Copy test stocks from old project
old = Path(r'..\MA_Stock_Trader\data\cache')
for f in ['20MICRONS.pkl', '360ONE.pkl', '3MINDIA.pkl']:
    shutil.copy2(old / f, cache_manager.cache_dir / f)

# Update with recent date
result = update_cache_for_date(date(2026, 6, 5))
print(f'Updated {result[\"updated\"]} stocks in {result[\"duration_sec\"]}s')

# Check cache stats
print(f'Cache: {cache_manager.stats()}')
"
```

---

## Next Step

**Step 5: Data API Endpoints** — add FastAPI endpoints to server.py for the data pipeline: trigger update, poll progress, query cache info. Then build a basic frontend data page to see cache status and trigger updates from the UI.

---

## 🎓 Learning From This Step

| Concept Used | What It Is | Suggested Learning Project | Focus Area |
|---|---|---|---|
| **Integration pattern** | Wiring two independent modules (fetcher + cache) together. Each module does one thing; the updater orchestrates them. | Build a `weather_fetcher.py` + `weather_store.py`, then an `update_weather()` function that downloads and saves | Separation of concerns, orchestration pattern |
| **Idempotent update** | Running the same update twice produces the same result (no duplicates). The updater checks `if date already exists` before inserting. | Write a CSV merger that reads a file, adds rows, but skips existing dates | Duplicate detection, `DataFrame.index.duplicated()` |
| **Progress tracking** | Logging batch completion during a long-running loop. Helps the frontend show a progress bar. | Write a script that processes 1000 files in batches of 50 with progress logging | `enumerate`, modulo operator, batch logging |
| **Gap detection** | Finding missing dates between two points. Skips weekends automatically. | Write a date range checker: given a start and end date, list all weekdays that are missing from a provided set | `timedelta`, `weekday()`, set operations |
