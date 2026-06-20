# Step 2: Backend Cache Manager
## Date: 8 June 2026

---

## What We Built

We created the **Cache Manager** — the foundational data layer for the entire system. This module handles reading, writing, and updating per-stock `.pkl` cache files in `data/cache/`.

### Files Created

| File | Purpose |
|------|---------|
| `backend/requirements.txt` | Core Python dependencies (fastapi, uvicorn, pandas, numpy, requests) |
| `backend/src/__init__.py` | Makes `src/` a Python package |
| `backend/src/cache_manager.py` | `CacheManager` class — all cache read/write/update logic |

### `CacheManager` Methods

| Method | What It Does |
|--------|-------------|
| `load(symbol)` | Load cached DataFrame from `.pkl` file |
| `save(symbol, data)` | Save DataFrame to `.pkl` file |
| `get_last_date(symbol)` | Latest trading date for a stock |
| `get_latest_cache_date()` | Latest date across all cached stocks |
| `needs_update(symbol)` | Check if stock data is stale (>3 days old) |
| `update(symbol, new_data)` | Merge new data into existing cache (deduplicates by date index) |
| `get_date_range(symbol, start, end)` | Slice cached data by date range |
| `stats()` | Return stock count, total size MB, latest date |
| `list_symbols()` | Return sorted list of all cached stock symbols |

### Data Format

Each `.pkl` file stores a `pandas.DataFrame` with:
- **Index:** `date` (DatetimeIndex)
- **Columns:** `open`, `high`, `low`, `close`, `volume`, `last_updated`, plus technical indicators

---

## Why This Architecture

The cache system separates raw data storage from data fetching and analysis:

```
NSE Bhavcopy → Bhavcopy Fetcher → Cache Manager (.pkl) → Scanner/Analysis
                                                      ↑
                                        Data Fetcher (yfinance/Upstox)
```

Benefits:
- **Incremental updates** — merge new data without re-downloading everything
- **No repeated API calls** — cached data survives restarts
- **Per-stock isolation** — one corrupt file doesn't break the whole system
- **Simple debugging** — `.pkl` files can be inspected directly in Python

---

## Verification

```powershell
cd MA_Stock_Trader_NA
# Copy a test file from the old project's cache
Copy-Item "..\MA_Stock_Trader\data\cache\20MICRONS.pkl" "data\cache\"

# Test in Python
backend\venv\Scripts\python -c "
import sys; sys.path.insert(0, 'backend')
from src.cache_manager import cache_manager
data = cache_manager.load('20MICRONS')
print(f'{len(data)} rows from {data.index[0].date()} to {data.index[-1].date()}')
print(f'Columns: {data.columns.tolist()}')
"

# Expected output:
# 221 rows from 2025-07-11 to 2026-06-04
# Columns: ['open', 'high', 'low', 'close', 'volume', 'last_updated', 'ma_20', ...]

# Clean up test
Remove-Item "data\cache\20MICRONS.pkl"
```

---

---

# 🗃️ Bonus Feature: Cache Index in SQLite

## What We Built (June 2026)

We added a **cache index** — a lightweight SQLite database table that stores metadata about every `.pkl` cache file. Instead of scanning 2000+ files with `glob('*.pkl')` every time we need stock count or date range, we now query SQLite — which is **instant**.

### Files Changed/Added

| File | Purpose |
|------|---------|
| `backend/src/db.py` | **NEW** — SQLite database manager (connection, schema, CRUD for cache_index) |
| `backend/src/cache_manager.py` | **UPDATED** — calls `db.upsert_cache_index()` after every `save()`, uses SQLite in `stats()` and `list_symbols()` |
| `backend/server.py` | **UPDATED** — auto-rebuilds cache index on server startup if empty |

### The SQLite Table

```sql
CREATE TABLE cache_index (
    symbol          TEXT PRIMARY KEY,      -- Stock symbol (e.g., "20MICRONS")
    row_count       INTEGER NOT NULL,      -- Number of trading days cached
    first_date      TEXT,                  -- Earliest date (e.g., "2025-07-11")
    last_date       TEXT,                  -- Latest date (e.g., "2026-06-08")
    file_size_bytes INTEGER NOT NULL,      -- Size of .pkl file on disk
    updated_at      TIMESTAMP              -- When this index entry was last written
);
```

This is stored in `data/settings.db` — the same SQLite file used by the broader project for settings, trade logs, etc.

---

## How the Flow Works

Here is the exact process, step by step:

### During Bhavcopy Update (write path)

```
1. bhavcopy_updater downloads NSE data for one stock
2. Calls cache_manager.update(symbol, new_data)
3. cache_manager.update() → read+merge+sort (combine old + new data)
4. Calls cache_manager.save(symbol, merged_data)
5. save() writes the full DataFrame to disk as 20MICRONS.pkl  ← .PKL FILE UPDATED
6. save() calls _update_index()                              ← SQLITE INDEX UPDATED
7. _update_index() computes: row_count, first_date, last_date, file_size
8. Calls db.upsert_cache_index(symbol, ...)
9. SQLite executes: INSERT OR REPLACE INTO cache_index ...
   → This updates the row if it exists (same symbol), inserts if new
```

After all stocks are processed, the SQLite `cache_index` table has fresh metadata for every cached stock. No separate scan needed.

### When Cache Data Tab Loads (read path)

```
1. Frontend calls GET /api/data/cache-info
2. Server calls cache_manager.stats()
3. stats() calls db.get_cache_stats()
4. SQLite executes:
   SELECT COUNT(*), SUM(file_size_bytes), MAX(last_date) FROM cache_index
5. Returns: {"stock_count": 2084, "total_size_mb": 69.03, "latest_date": "2026-06-08"}
6. This is sent to the frontend — instant, no file I/O
```

And for listing stocks:

```
1. Frontend calls GET /api/data/symbols
2. Server calls cache_manager.list_symbols()
3. Calls db.list_symbols_from_index()
4. SQLite executes: SELECT symbol FROM cache_index ORDER BY symbol
5. Returns sorted list of all 2084 symbols — instant
```

### What Happens on Server Startup

```python
# server.py startup event
if cache_index is empty:
    cache_manager.rebuild_index()  # scan .pkl files, write all metadata to SQLite
else:
    skip rebuild  # index is already populated
```

This ensures that even if SQLite gets deleted or corrupted, the server auto-rebuilds it from the `.pkl` files on next restart.

---

## What Changed in Each File

### `backend/src/db.py` (NEW)

- **Thread-local connections** — uses `threading.local()` so each thread (main thread, uvicorn workers, background tasks) gets its own SQLite connection. This is required because SQLite connections are not safe to share across threads.
- **WAL mode** — `PRAGMA journal_mode=WAL` enables concurrent reads+writes safely.
- **Schema auto-creation** — `init_db()` runs on import, creates the `cache_index` table if it doesn't exist.
- **Key functions:**
  - `upsert_cache_index()` — insert or update one stock's metadata
  - `delete_cache_index()` — remove a stock from the index
  - `get_cache_stats()` — aggregate stats (COUNT, SUM, MAX)
  - `list_symbols_from_index()` — sorted list of all symbols
  - `get_stale_stocks(cutoff_date)` — find stocks older than a date
  - `rebuild_cache_index()` — scan all .pkl files, rebuild entire index

### `backend/src/cache_manager.py` (UPDATED)

- **`save()` now writes to SQLite** — after writing the `.pkl` file, it calls `self._update_index()` which computes metadata and calls `db.upsert_cache_index()`.
- **`stats()` uses SQLite first** — calls `db.get_cache_stats()`. If the index is empty (first run), falls back to filesystem `glob`.
- **`list_symbols()` uses SQLite first** — calls `db.list_symbols_from_index()`. Falls back to glob if empty.
- **`rebuild_index()`** — new method that calls `db.rebuild_cache_index()`. Can be called manually for recovery.
- **`get_latest_cache_date()`** — now checks SQLite first, falls back to filesystem scan.

### `backend/server.py` (UPDATED)

- **Startup event** — `@app.on_event("startup")` checks if the cache index is empty. If so, it calls `cache_manager.rebuild_index()` to populate it from `.pkl` files. This runs when the server starts, not on import.

---

## SQLite vs PostgreSQL: What's the Difference?

This is an important distinction. Both are **relational databases** that understand SQL, but they are designed for very different use cases.

### SQLite (What We Use)

| Property | SQLite |
|----------|--------|
| **Type** | Embedded, serverless database engine |
| **File** | A single file: `data/settings.db` |
| **Setup** | Zero configuration. `pip install` not needed — it's a Python built-in module (`import sqlite3`). |
| **Connection** | Direct file access. No server process, no port, no hostname. |
| **Concurrency** | WAL mode allows one writer + many readers. Best for single-server apps. |
| **Size limit** | 281 TB (plenty for our 70 MB cache index). |
| **Use case** | Local application data — this project's settings, trade logs, cache index. |

**Analogy:** SQLite is like a text file that speaks SQL. You point your code at it and read/write directly. No installation, no administration, no running server.

### PostgreSQL (What You Have Externally)

| Property | PostgreSQL |
|----------|------------|
| **Type** | Client-server relational database |
| **Setup** | Requires installation, configuration, running server process (usually port 5432). |
| **Connection** | Connect via host:port with authentication (username, password, SSL). |
| **Concurrency** | Full ACID compliance with MVCC. Handles hundreds of concurrent connections from different machines. |
| **Features** | Advanced indexing, full-text search, replication, stored procedures, triggers, extensions. |
| **Use case** | Multi-user production applications — web apps, enterprise systems, analytics platforms. |

**Analogy:** PostgreSQL is like a dedicated database server with its own room, administrator, and security guard. You connect to it over the network.

### Why We Don't Use PostgreSQL Here

This project's data needs:

1. **The cache index is local metadata** — it describes what's in `data/cache/`, which is on the same machine. There's no reason to connect to a remote database for this.
2. **Zero configuration** — SQLite "just works" when you run `bun run dev`. No need to install PostgreSQL, create a database, set up users, or configure environment variables.
3. **Single-user** — only one person runs this trading system at a time. SQLite handles this perfectly.
4. **Portability** — the entire system lives in a folder. `data/settings.db` can be copied, zipped, or gitignored as needed. PostgreSQL would require a separate backup/restore process.

### When Would You Use PostgreSQL?

If you were building a **multi-user trading platform** where:
- Multiple people access the same trade logs from different computers
- You need point-in-time recovery and replication
- You have gigabytes of historical data with complex analytical queries

Then PostgreSQL would be the right choice. But for a **single-user swing trading system**, SQLite is the correct, simpler, faster choice.

---

## Key Design Decisions

1. **Thread-local connections** — SQLite connections cannot be shared across threads (it raises `ProgrammingError`). We use `threading.local()` so each thread (main, uvicorn, background task) gets its own connection to the same `.db` file. WAL mode ensures they don't conflict.

2. **Index after file write** — The `.pkl` file is written FIRST, then the SQLite index is updated. If the SQLite write fails, the `.pkl` file is still valid (the index will be rebuilt on next server restart). Never vice versa.

3. **Fallback to glob** — If the SQLite index is empty (first run, or after deletion), `stats()` and `list_symbols()` transparently fall back to filesystem `glob`. This means the system works even without SQLite.

4. **Server auto-rebuild** — On startup, if the index is empty, the server rebuilds it from `.pkl` files. No manual action needed.

---

## Verification

```powershell
cd MA_Stock_Trader_NA
backend\venv\Scripts\python -c "
import sys; from pathlib import Path; sys.path.insert(0, 'backend')
from src.cache_manager import cache_manager
from src import db

# Before rebuild — index is empty
print('Before:', db.get_cache_stats())

# Rebuild index from .pkl files
count = cache_manager.rebuild_index()
print(f'Rebuilt: {count} entries')

# After rebuild — index has data
print('After:', db.get_cache_stats())

# Verify save writes to index
import pandas as pd
test = pd.DataFrame({'open': [100], 'high': [101], 'low': [99], 'close': [100], 'volume': [1000]},
                    index=pd.to_datetime(['2026-06-09']))
cache_manager.save('_TEST', test)
print('_TEST in index:', '_TEST' in db.list_symbols_from_index())

# Cleanup
cache_manager.get_cache_path('_TEST').unlink(missing_ok=True)
db.delete_cache_index('_TEST')
"
```



## 🎓 Learning From This Step

| Concept Used | What It Is | Suggested Learning Project | Focus Area |
|---|---|---|---|
| **pickle** | Python's built-in serialization format. Converts any Python object into a byte stream for file storage. | Write a small contacts app that saves/loads a list of contact dicts to a `.pkl` file | Serialization, `pickle.dump()`, `pickle.load()` |
| **pandas DataFrame** | 2D labeled data structure (rows × columns). The core data container for stock OHLCV data. | Load a CSV of temperature data, filter by date range, calculate monthly averages | Indexing, boolean masking, `pd.concat()`, `sort_index()` |
| **Path (pathlib)** | Modern Python path handling. Cross-platform, chainable `.glob()`, `.stem()`, `.exists()`. | Write a script that finds all `.csv` files in a folder and prints their sizes | `Path.glob()`, `Path.stem`, path manipulation |
| **DataFrame index** | The row label — can be datetime, integer, or string. Enables fast lookups and date range slicing. | Create a DataFrame with a DatetimeIndex, practice `.loc[]` and `.iloc[]` access | `DatetimeIndex`, `.loc[]`, boolean indexing on index |
| **SQLite** | Serverless, embedded SQL database engine. The entire database is a single file on disk. | Build a CLI to-do list that stores tasks in SQLite (add, list, complete, delete) | `CREATE TABLE`, `INSERT`, `SELECT`, `DELETE`, `PRAGMA` |
| **`threading.local()`** | Python mechanism for thread-local storage. Each thread gets its own copy of a variable. | Create a multi-threaded counter where each thread tracks its own count | Thread safety, shared vs local state |
| **WAL mode** | SQLite Write-Ahead Logging. Allows concurrent reads while a write is in progress. | Benchmark SQLite INSERT speed with vs without WAL mode | `PRAGMA journal_mode=WAL`, concurrency models |
| **Fallback pattern** | Try primary source first, fall back to secondary if empty. Used in `stats()` and `list_symbols()`. | Design a config loader that checks env vars first, then config file, then defaults | Graceful degradation, layering |
