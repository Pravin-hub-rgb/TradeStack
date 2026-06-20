# Step 5: Data API Endpoints
## Date: 8 June 2026

---

## What We Built

FastAPI REST API endpoints that expose the data pipeline (bhavcopy update, cache info, gap filling) to the frontend. Also added background task support with progress polling.

### Files Changed / Created

| File | Change |
|------|--------|
| `backend/server.py` | Rewritten — added 7 new endpoints + background task engine |
| `backend/src/bhavcopy_updater.py` | Modified — added `progress_callback` parameter |
| `tests/step5_data_api.py` | New — HTTP tests against live server on temp port |

### New API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Returns `{"status": "healthy"}` |
| `POST` | `/api/data/update-bhavcopy` | Start background bhavcopy update. Optional `{"date": "2026-06-05"}` body. Returns `operation_id`. |
| `GET` | `/api/data/status/{operation_id}` | Poll progress — returns `progress`, `message`, `status`, and `result` when done. |
| `GET` | `/api/data/cache-info` | Cache statistics — stock count, size MB, latest date |
| `GET` | `/api/data/cache-dates` | All unique dates present in cache |
| `GET` | `/api/data/symbols` | All cached stock symbols |
| `POST` | `/api/data/fill-gaps` | Automatically fill all missing cache dates |

### Background Task Pattern

```
1. POST /api/data/update-bhavcopy
   → Creates operation_id, stores in active_operations dict
   → Returns immediately with {"status": "started", "operation_id": "..."}

2. Background task runs update_cache_for_date()
   → Calls progress_callback(pct, message) at each batch
   → Updates active_operations[operation_id] with progress

3. Frontend polls GET /api/data/status/{operation_id}
   → Gets {"progress": 67, "message": "150/200 stocks...", "status": "running"}
   → When done: {"status": "completed", "result": {...}}
```

### `update_cache_for_date` Progress Callback

```python
def progress(pct: float, msg: str):
    active_operations[op_id].update(progress=pct, message=msg)

result = update_cache_for_date(target_date, progress_callback=progress)
```

---

## Why Background Tasks

Bhavcopy downloads take 10-30 seconds. Scanning all cached stocks against the bhavcopy takes another 5-60 seconds depending on cache size. Blocking the HTTP response for this long would:

- Time out frontend requests (browsers timeout after 30s)
- Block the server from handling other requests
- Give no feedback to the user

With the background task pattern:
- Request returns instantly with an `operation_id`
- Frontend polls `GET /api/data/status/{operation_id}` every 1-2 seconds
- User sees a live progress bar while the update runs

---

## Verification

```powershell
cd MA_Stock_Trader_NA

# Start the server
backend\venv\Scripts\python -c "
import sys; sys.path.insert(0, 'backend')
import shutil; from pathlib import Path
from src.cache_manager import cache_manager
old = Path(r'..\MA_Stock_Trader\data\cache')
for f in ['20MICRONS.pkl']:
    shutil.copy2(old / f, cache_manager.cache_dir / f)
"

# (in another terminal) Start server on 8001
backend\venv\Scripts\python backend\server.py

# Test endpoints
curl http://localhost:8001/health
curl http://localhost:8001/api/data/cache-info
curl -X POST http://localhost:8001/api/data/update-bhavcopy -H "Content-Type: application/json" -d "{\"date\": \"2026-06-05\"}"
```

---

## Next Step

**Step 6: Frontend Data Dashboard** — build a data management page in Next.js showing cache status, trigger bhavcopy updates, and display real-time progress via polling.

---

## 🎓 Learning From This Step

| Concept Used | What It Is | Suggested Learning Project | Focus Area |
|---|---|---|---|
| **BackgroundTasks** | FastAPI's built-in mechanism for running work after the HTTP response is sent. Non-blocking, lightweight. | Build a "send email" endpoint that returns immediately and logs the email in the background | `BackgroundTasks.add_task()`, thread safety |
| **Progress polling pattern** | Client starts a job, gets an ID, then polls a status endpoint until complete. Solves the timeout problem for long operations. | Build a file-processing service where you POST a CSV and poll `/status/{id}` for row count progress | Operation ID generation, race conditions, polling interval |
| **HTTP server test pattern** | Start a server in a thread, make real HTTP requests, assert responses. Tests the full stack including routing, serialization, and error handling. | Write integration tests for a todo API using `threading.Thread` + `urllib.request` | `Thread(target=server_fn, daemon=True)`, port selection |
| **Optional callback pattern** | Passing a function as a parameter to report intermediate progress. The caller decides whether to log, store, or display it. | Write a download function that accepts `on_progress(bytes_downloaded, total)` | `callable` type hint, None-check before calling |
