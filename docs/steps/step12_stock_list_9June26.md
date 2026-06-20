# Step 12: Stock List — SQLite-Based Persistence

**Date:** 9 June 2026

## What We Built

A fully persistent stock list management system using SQLite as the single source of truth, replacing the old JSON + TXT dual-file approach.

### Key Design Decision: No TXT File

In the old codebase, stocks flowed through **two files**:
```
Scanner → JSON metadata → Finalize → TXT file → Live trader reads TXT
```

The `.txt` file existed only because the old Python live trader (`stock_classifier.py`) parsed a plain text file. In the new architecture, both the Python microservice and the TypeScript live trader share the same SQLite database. **The `.txt` file is eliminated** — the live trader reads directly from `stock_list_items` table in `data/settings.db`.

### Architecture

```
Scanner (+) ──→ POST /api/stock-list ──→ stock_list_items table
                                                 │
Scanner (-) ──→ DELETE /api/stock-list ──→ removes row
                                                 │
Stocks List tab ──→ GET /api/stock-list ───── reads
                                                 │
Live Trader (future) ───────────────────── reads  (no .txt needed)
```

## What Changed

### 1. `backend/src/db.py` — New Table + 5 CRUD Functions

**Table schema:**
```sql
CREATE TABLE IF NOT EXISTS stock_list_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    list_type TEXT NOT NULL,          -- 'continuation' | 'reversal'
    symbol    TEXT NOT NULL,
    close     REAL,
    trend_context TEXT,               -- reversal: 'uptrend' | 'downtrend'
    period    INTEGER,                -- reversal: best decline period
    depth_pct REAL,                   -- continuation: depth %
    added_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(list_type, symbol)
);
```

**CRUD functions:**
| Function | SQL | Returns |
|----------|-----|---------|
| `add_stock_to_list(list_type, symbol, ...)` | INSERT OR CONFLICT DO UPDATE | `True` if new |
| `remove_stock_from_list(list_type, symbol)` | DELETE | `True` if existed |
| `get_stock_list(list_type)` | SELECT ORDER BY added_at DESC | `list[dict]` |
| `is_stock_in_list(list_type, symbol)` | SELECT 1 WHERE | `bool` |
| `clear_stock_list(list_type)` | DELETE ALL WHERE | `int` count |

### 2. `backend/server.py` — 5 New Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/stock-list/{list_type}` | List saved stocks for a type |
| `POST /api/stock-list/{list_type}` | Add stock (body: `symbol`, `close`, `trend_context?`, `period?`, `depth_pct?`) |
| `DELETE /api/stock-list/{list_type}/{symbol}` | Remove one stock (404 if missing) |
| `GET /api/stock-list/{list_type}/check/{symbol}` | Check if stock is in list |
| `DELETE /api/stock-list/{list_type}` | Clear all stocks for type |

### 3. `frontend/src/components/StockList.tsx` — NEW Component

- **Two sections** in gradient cards: Continuation List + Reversal List
- Each section shows:
  - Header with icon + count badge
  - Per-row display: Symbol, Close, Extra info (depth% for continuation, trend chip + period for reversal), Added date, Remove (X) button
  - Empty state: guidance message on how to add stocks
  - Clear All button (disabled when empty)
- Fetches from `GET /api/stock-list/{list_type}` on mount, refreshes after each mutation

### 4. `frontend/src/app/page.tsx`
- Replaced `<Placeholder title="Stocks List" />` with `<StockList />`

### 5. `frontend/src/components/ContinuationScanner.tsx`
- Removed local `continuationList` state (in-memory only, lost on refresh)
- Added `savedSymbols` state, fetched from API on mount
- `toggleContinuation()` now calls `POST /api/stock-list/continuation` or `DELETE /api/stock-list/continuation/{symbol}`
- +/- icon reflects API state after each toggle

### 6. `frontend/src/components/ReversalScanner.tsx`
- **Added Actions column** (was missing entirely — only ContinuationScanner had it)
- Added `savedSymbols` state + fetch on mount
- Added `toggleReversal()` that calls `POST /api/stock-list/reversal` or `DELETE`
- Added +/- IconButton per row (green AddIcon / red CloseIcon)

## Why This Approach

| Decision | Why |
|----------|-----|
| SQLite single source of truth | Both Python and TypeScript can read/write `data/settings.db`. No sync needed between JSON and TXT. |
| No TXT file | Old TXT was only for live trader compatibility. New live trader reads DB directly. |
| `+` saves to DB immediately | The list IS the finalized list. No separate draft/active step. No Finalize button needed. |
| Upsert (INSERT OR CONFLICT DO UPDATE) | Adding the same stock again updates its data (close, depth) instead of erroring. |
| Remove returns 404 on missing | Clear error signal for frontend toast messages. |

## Verification

```powershell
# Run tests
cd MA_Stock_Trader_NA\backend
.\venv\Scripts\python ..\tests\step12_stock_list.py

# Test API directly
curl http://localhost:8001/api/stock-list/continuation
# → {"stocks":[],"count":0}

curl -X POST http://localhost:8001/api/stock-list/continuation ^
  -H "Content-Type: application/json" ^
  -d "{\"symbol\":\"SBIN\",\"close\":800.5,\"depth_pct\":12.5}"
# → {"status":"added","symbol":"SBIN"}

curl http://localhost:8001/api/stock-list/continuation/check/SBIN
# → {"in_list":true}
```

## Test Results

**15 tests pass:**
- `test_add_and_list` — add stock, verify fields
- `test_add_duplicate_updates` — re-adding updates data, returns False
- `test_is_in_list` — check presence after add/remove
- `test_remove` — remove existing returns True, missing returns False
- `test_clear` — clear returns count
- `test_reversal_stock` — trend_context and period persist correctly
- `test_list_type_isolation` — continuation and reversal lists are independent
- `test_server_endpoints` — 8 HTTP tests: health, add, check, list, remove, 404, clear, reversal stock

## 🎓 Learning From This Step

| Concept | What It Is | Suggested Learning Project | Focus Area |
|---------|-----------|---------------------------|------------|
| **SQLite as shared state** | Single DB file read/written by multiple processes/services on the same machine | Build a todo list where a Python API writes tasks and a Node.js script reads them from the same DB | WAL mode, thread safety, concurrent access |
| **Upsert pattern** | INSERT ... ON CONFLICT DO UPDATE — insert or update in one statement | Build a "favorites" system where toggling a favorite creates or updates a row | Conflict resolution, return values |
| **API-driven +/- toggle** | Click a button → API call → update UI from response | Build any "add to collection" UI where local state is derived from server state | Optimistic vs pessimistic updates, error handling |
| **Eliminating redundant file formats** | Replacing JSON+TXT dual storage with a single DB table | Audit a project for files that contain derived data and eliminate them | Data flow analysis, single source of truth |
