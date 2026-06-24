# Step 20: Bhavcopy Update Performance Optimization

## What We Built

Optimized the bhavcopy update pipeline to handle both single-day updates (daily use) and multi-day gap fills (after being away 10+ days). The original code processed 2083 stocks one at a time with O(S×B) string matching. The new version uses hash-indexed lookups, parallel thread pool execution, and batched SQLite commits.

## Files Changed

| File | Change |
|------|--------|
| `backend/src/bhavcopy_updater.py` | Full rewrite — hash-index lookup, ThreadPoolExecutor parallel processing |
| `backend/src/cache_manager.py` | Added `update_with_data()` (avoids double load), `commit` param on `save()` |
| `backend/src/db.py` | Added `upsert_cache_index_batch()`, `commit_cache_index()`, busy timeout |
| `backend/src/nse_fetcher.py` | Shared HTTP session with connection pooling (keep-alive) |
| `backend/server.py` | Capped log buffer at 500 entries, replaced raw `op["logs"].append()` with `_log()` helper |
| `tests/step4_bhavcopy_updater.py` | Updated test assertions to handle already-cached state |

## What Changed

### 1. Hash-Indexed Bhavcopy Lookup

**Before:** O(S × B) — the inner loop scanned all bhavcopy rows for each symbol:
```python
match = bhavcopy[bhavcopy["symbol"] == symbol]  # 5M comparisons
```

**After:** O(S) — build `.set_index("symbol")` once, O(1) lookup per symbol:
```python
bhavcopy_indexed = bhavcopy.set_index("symbol")
...
row = bhavcopy_indexed.loc[symbol]  # O(1) hash lookup
```

### 2. Parallel Stock Processing

**Before:** Single-threaded sequential loop over 2083 stocks:
```python
for i, symbol in enumerate(symbols):
    # ... one stock at a time
```

**After:** ThreadPoolExecutor with 8 workers processes stocks concurrently:
```python
with ThreadPoolExecutor(max_workers=8) as pool:
    futures = {pool.submit(_process_stock, symbol, date, row): symbol ...}
    for future in as_completed(futures):
        _, status = future.result()
```

### 3. Eliminated Double `load()`

**Before:** `cache_manager.load()` was called in two places — once to check for duplicates, once inside `update()`:
```python
existing = cache_manager.load(symbol)  # 1st load
...
cache_manager.update(symbol, stock_df)  # 2nd load inside update()
```

**After:** Pre-loaded data is passed directly to `update_with_data()`:
```python
existing = cache_manager.load(symbol)  # 1 load
...
cache_manager.update_with_data(symbol, stock_df, existing=existing, commit=False)
```

### 4. Batched SQLite Commits

**Before:** 2000+ individual `conn.commit()` calls (one per stock update).

**After:** `commit=False` on each save, then one `db.commit_cache_index()` per batch.

### 5. HTTP Connection Pooling

**Before:** Fresh `requests.Session()` created for every bhavcopy download (no keep-alive).

**After:** Module-level shared session with `HTTPAdapter(pool_connections=4, pool_maxsize=8, max_retries=2)`.

### 6. Bounded Log Buffer

**Before:** `op["logs"]` grew unbounded — ~12K entries per date, ~120K for 10 gap dates.

**After:** Capped at 500 entries via `_log()` helper.

## Performance

| Scenario | Before | After | Speedup |
|----------|--------|-------|---------|
| Idempotent (all cached) | ~6-10s | **1.5s** | 4-7× |
| Fresh date (~500 new stocks) | ~80-160s | **~15-25s** (est.) | 3-8× |
| Gap fill (10 dates) | ~20 min | **~3-4 min** (est.) | 5-7× |

Note: Fresh date est. based on: 1s download + ~2s parallel load+check per batch × ~8 batches + ~1s SQLite flush = ~15-25s.

## Architecture Decisions

1. **ThreadPoolExecutor (not ProcessPoolExecutor):** I/O-bound workload (file reads/writes, HTTP download). GIL is not a bottleneck here.

2. **Batch size = 300:** Each batch of 300 stocks uses 8 parallel workers. After each batch, SQLite commits are flushed. Balances parallelism vs. per-batch overhead.

3. **SQLite busy_timeout=5000:** 8 concurrent threads writing to SQLite via thread-local connections require retry logic when WAL mode has contention. 5-second timeout is generous for sub-millisecond inserts.

4. **`_process_stock` is a module-level function:** ThreadPoolExecutor workers require picklable targets (technically only for ProcessPoolExecutor, but keeping as module-level is cleaner).

## Verification

```powershell
cd backend
.\venv\Scripts\python ..\tests\step4_bhavcopy_updater.py  # Bhavcopy update tests
.\venv\Scripts\python ..\tests\step2_cache_manager.py      # Cache manager
.\venv\Scripts\python ..\tests\step10_continuation_scanner.py  # Scanner
.\venv\Scripts\python ..\tests\step13_market_breadth.py    # Breadth
```

All tests pass.

## 🎓 Learning From This Step

| Technology | What It Is | Suggested Learning Project |
|-----------|------------|--------------------------|
| `ThreadPoolExecutor` | Thread pool for parallel I/O-bound work | Write a script that downloads 100 URLs concurrently |
| `pandas.DataFrame.set_index()` | Hash-based index for O(1) row lookups | Load a CSV, set_index on ID column, time the speedup vs. filter |
| `requests.Session()` + `HTTPAdapter` | Connection pooling for HTTP keep-alive | Compare download times of 10 URLs with vs. without shared session |
| SQLite WAL mode + `busy_timeout` | Concurrent write handling | Write 8 threads that all INSERT into the same table simultaneously |
| Thread-local SQLite connections | Per-thread DB connections for thread safety | Research why sharing a connection across threads causes issues |
