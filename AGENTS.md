# TradeStack — Agent Context

## READ THIS FIRST before any code changes

---

## Project Overview

We are rebuilding **TradeStack** — a systematic NSE equity swing trading system — from the original Python-only codebase into a **tri-partite architecture**:

| Component | Language | Location | Job |
|-----------|----------|----------|-----|
| **Frontend** | TypeScript (Next.js) | `frontend/` | UI, settings panel, dashboards |
| **Live Trader** | TypeScript (Node.js) | `frontend/src/lib/live-trader/` | WebSocket, tick processing, state machines |
| **Data Microservice** | Python (FastAPI) | `backend/` | Scanner, bhavcopy, VAH, market breadth |

They share a SQLite database in `data/` for settings, trade logs, and cache index.

---

## Folder Structure

```
TradeStack/
├── AGENTS.md                         ← THIS FILE — read first
├── package.json                      ← Root scripts (bun run dev launches both servers)
│
├── docs/
│   ├── steps/                        ← Step-by-step rebuild docs
│   │   ├── step1_project_setup_8June26.md    ← Current: project scaffold is done
│   │   ├── step2_...                         ← Future: one per rebuild phase
│   │   └── stepN_...                         ← Each is a tutorial + reference
│   ├── NEXTJS_PYTHON_ARCHITECTURE_8June26.md     ← Architecture decision (WHY)
│   ├── REBUILD_FROM_SCRATCH_ROADMAP_V2_8June26.md ← Full phased plan (WHEN)
│   └── MA_STOCK_TRADER_LEARNING_CURRICULUM_V2_8June26.md ← Learning projects (HOW)
│
├── frontend/                         ← Next.js 16.2.7 (App Router, TypeScript, Tailwind)
│   ├── src/app/                      ← Pages (file-based routing)
│   ├── src/lib/live-trader/          ← Node.js live trader (built in later steps)
│   ├── public/                       ← Static assets
│   ├── AGENTS.md                     ← Next.js version-specific notes
│   ├── package.json                  ← Frontend-only dependencies
│   └── node_modules/
│
├── backend/                          ← Python FastAPI data microservice
│   ├── server.py                     ← Entry point with health check (/health)
│   ├── src/                          ← Python source modules (copied from old project)
│   ├── venv/                         ← Python virtual environment
│   └── requirements.txt
│
├── data/                             ← Shared runtime data (gitignored)
│   ├── cache/                        ← Stock data cache (.pkl files)
│   ├── settings.db                   ← SQLite database for config + trade logs
│   └── logs/
│
└── old-legacy-code/              ← Reference: original codebase archive
```

---

## What Has Been Done (Current State)

**Steps 1–9 complete.** Full data pipeline + UI + indicators + settings engine operational.

### Step 1: Project Setup
- [x] `MA_Stock_Trader_NA/` folder created
- [x] Next.js 16 initialized with bun (TypeScript, Tailwind, App Router)
- [x] Python FastAPI backend with venv + health check
- [x] Root `package.json` with concurrently (`bun run dev` starts both)
- [x] Architecture + roadmap + learning docs copied/created
- [x] Step 1 doc written
- [x] Python server verified working (returns `{"status":"healthy"}`)

### Step 2: Cache Manager
- [x] `backend/src/cache_manager.py` — per-stock `.pkl` read/write/update/merge
- [x] Verified: 20MICRONS has 222 rows matching old codebase
- [x] Default cache dir is absolute (resolves from `cache_manager.py` location)
- [x] 9 tests pass

**Cache Index in SQLite** (bonus feature, added June 2026):
- [x] `backend/src/db.py` — SQLite database manager (thread-local connections, WAL mode)
- [x] `cache_index` table in `data/settings.db` — stores per-stock metadata (row count, date range, file size)
- [x] After every `save()`, metadata is written to SQLite (`_update_index()` in cache_manager)
- [x] `stats()` and `list_symbols()` query SQLite first (instant), fall back to filesystem `glob`
- [x] Server auto-rebuilds cache index on startup if empty (`cache_manager.rebuild_index()`)
- [x] Flow: bhavcopy update → save .pkl → upsert SQLite index → frontend queries SQLite for stats

### Step 3: NSE Bhavcopy Fetcher
- [x] `backend/src/nse_fetcher.py` — 2-layer fallback downloader
- [x] Live test: 2443 stocks for 2026-06-05

### Step 4: Bhavcopy Updater
- [x] `backend/src/bhavcopy_updater.py` — batch processing, gap detection, idempotent update
- [x] Per-stock progress logging every 5-10 stocks via `progress_callback`
- [x] Test `test_update_idempotent` fails due to live cache (expected)

### Step 5: Data API Endpoints
- [x] `backend/server.py` — 7 endpoints: cache stats, stock list, bhavcopy update, progress poll, stock data, date range, health
- [x] Background task + polling pattern for long operations
- [x] `UpdateRequest` made optional (frontend sends empty POST)
- [x] Progress callback stores `logs[]` with `[HH:MM:SS]` timestamps
- [x] Server runs with `reload=False` (prevents crashes on file saves)

### Step 6: Full UI Restructure
- [x] Installed `@mui/material` v9, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`
- [x] `Providers.tsx` — exact old dark theme (`#1a1a2e` → `#16213e` → `#0f3460` gradient, indigo primary `#6366f1`)
- [x] `Navbar.tsx` — gradient nav with Scanner/Market Breadth/Live Trading + Server health dot (green/red/yellow, polls `/health` every 30s)
- [x] `CacheData.tsx` — cache management UI + live terminal logs below cards with auto-scroll
- [x] `ToastNotification.tsx` — animated toast with slide-in/shimmer/countdown bar
- [x] `layout.tsx` — MUI Providers + Navbar + Container
- [x] `page.tsx` — Scanner page with 4 sub-tabs: Cache Data (default), Continuation, Reversal, Stocks List
- [x] `/breadth` and `/live-trading` placeholder pages
- [x] Deleted old `/data` route (merged into scanner page)
- [x] Cache data re-copied (2084 .pkl files, 68.81 MB, updated to 08 Jun 2026)

### Step 7: Technical Indicators
- [x] `backend/src/indicators.py` — 13 pure functions matching old codebase formulas
- [x] SMA20, ADR%, MA angle (5-point linear regression), price change, high/low distance, volume surge, rising MA, near-SMA, base filters
- [x] `compute_all_indicators()` returns DataFrame with all indicator columns
- [x] `check_base_filters()` returns `(bool, reason)` for UI debugging
- [x] 31 tests pass (real + synthetic data)
- [x] `docs/steps/step7_technical_indicators_8June26.md` written

### Upstox Historical Data Downloader (+ Token Management)
- [x] `backend/src/upstox_fetcher.py` — Downloads 180 calendar days (~120 trading days) of EOD data for all NSE stocks via Upstox API. Uses direct HTTP requests (no SDK dependency). Instrument mapping from `data/complete.csv.gz` (8635 NSE stocks).
- [x] `backend/src/upstox_config.py` — Token storage/validation using SQLite (`upstox_config` table in `settings.db`). `validate_token()` saves + tests against 3 stocks. `check_token()` is read-only. `get_status()` returns masked display.
- [x] `backend/src/db.py` — Added `upstox_config` key-value table.
- [x] `backend/server.py` — 3 new endpoints: `GET /api/token/status`, `POST /api/token/validate`, `POST /api/data/download-historical`.
- [x] `frontend/src/components/TokenDialog.tsx` — MUI dialog for token input (password-masked, validate & update button, success/error feedback).
- [x] `frontend/src/components/CacheData.tsx` — "Download Data" button that checks for token → prompts dialog if missing → starts background download → streams progress to terminal log. Disabled when cache has data.
- [x] Flow: click Download Data → check token → if valid, POST /api/data/download-historical → background task iterates all stocks → saves to .pkl via cache_manager.update() → progress via terminal logs.
- [x] `data/complete.csv.gz` — Copied from old project. Required for instrument key mapping.

---

## How to Operate

### Run the project
```powershell
cd TradeStack
bun run dev
```
This starts:
- **Next.js** on http://localhost:3000 (`[next]` in cyan)
- **Python** on http://localhost:8001 (`[py]` in green)

### Verify health
```powershell
curl http://localhost:8001/health
# → {"status":"healthy"}
```

### Each rebuild phase = one step doc
Every phase in the roadmap gets a `docs/steps/stepN_name_date.md` file written DURING that phase. The doc captures:
- What we built
- Why (architecture reasoning)
- Commands used
- Verification steps
- 🎓 Learning table (concepts introduced + suggested projects to learn them)

---

## How to Read the Old Code (Reference)

The original codebase is in `old-legacy-code/`. When rebuilding a feature:

1. Read the old file to understand the original logic
2. Check the roadmap doc (`docs/REBUILD_FROM_SCRATCH_ROADMAP_V2_8June26.md`) to see which phase we're in
3. Check the architecture doc (`docs/NEXTJS_PYTHON_ARCHITECTURE_8June26.md`) for why the split is what it is
4. Build the new version following the step doc

**Do NOT copy-paste old code.** Each feature should be rewritten with clean architecture.

---

## Testing Approach

**ALL test scripts MUST live in `tests/` and run from there.** Never write tests to `/tmp` or any other location.

Each step produces test scripts in `tests/` that verify the new code works correctly.

**Test flow:**
1. Every step creates one or more test scripts in `tests/stepN_name.py` (Python) or `tests/stepN_name.test.ts` (TypeScript)
2. Tests are standalone — run them anytime to verify nothing is broken
3. Tests compare new output against old codebase behavior where applicable
4. After a bug fix, create/update a test that reproduces the bug so it never comes back

**How to run tests:**
```powershell
cd TradeStack\backend
.\venv\Scripts\python ..\tests\step8_upstox_downloader.py
```

**Using old codebase for comparison:**
When a test needs expected values, reference the original code's output:
```python
# tests/step2_cache_manager.py
from src.cache_manager import cache_manager

# Load the same stock from new cache
data = cache_manager.load("20MICRONS")

# Verify basic invariants (same as old codebase expected)
assert not data.empty
assert "close" in data.columns
assert len(data) > 200  # Old code had 221 rows for this stock
```

---

## Learning Approach

Every step doc has a **🎓 Learning From This Step** table at the bottom. It lists each technology introduced with:
- **What It Is** — 2-line explanation
- **Suggested Learning Project** — a small standalone project to build
- **Focus Area** — what specific aspect to pay attention to

The full curriculum map is in `docs/MA_STOCK_TRADER_LEARNING_CURRICULUM_V2_8June26.md`.

---

## Key Principles

1. **Python does data. Node.js does live events.** Never put pandas/scanner work in the same process as WebSocket tick handling.
2. **All config lives in the database, not in source files.** Every parameter must be editable from the Settings UI without editing code.
3. **Each step produces a working system.** You can stop at any step and have something usable.
4. **Frontend always follows backend.** Never build a UI feature before its API exists.
5. **Modular & small files.** Each file should do one thing. If a file exceeds ~150 lines, split it. Prefer many small focused modules over a few large ones. This makes debugging, testing, and parallel work easier.

---

## Need More Context?

| Document | What It Answers |
|----------|----------------|
| `docs/NEXTJS_PYTHON_ARCHITECTURE_8June26.md` | Why this architecture, what goes where, settings engine design |
| `docs/REBUILD_FROM_SCRATCH_ROADMAP_V2_8June26.md` | Full phased plan, what to build when, time estimates |
| `docs/MA_STOCK_TRADER_LEARNING_CURRICULUM_V2_8June26.md` | All concepts mapped with learning projects |
| `docs/steps/step1_project_setup_8June26.md` | What was built in step 1, commands, concepts introduced |
| `docs/steps/step2_cache_manager_8June26.md` | Cache manager + **SQLite cache index** (bonus feature: save .pkl → update SQLite → instant stats) |
| `docs/steps/step6_frontend_data_dashboard_8June26.md` | Full UI restructure, MUI theme, terminal log pattern, learning table |
| `docs/steps/step7_technical_indicators_8June26.md` | Indicator functions, formulas, 31 test patterns, learning table |
| `docs/steps/step8_upstox_historical_downloader_9June26.md` | Upstox data downloader, token management, direct HTTP API flow |
| `MA_Stock_Trader_OLD/AGENTS.md` | (if exists) Context for the original codebase |

---

## Live Trader — Data Streaming (Verified Jun 10, 11:23 AM IST)

- **Streamer works**: WebSocket connects (`followRedirects: true`), subscribes, and receives live ticks for both indices and equities.
- **Key discovery**: Equity instrument keys must use ISIN format (`NSE_EQ|INE002A01018`), NOT trading symbol format (`NSE_EQ|RELIANCE`). The `complete.csv.gz` file maps `tradingsymbol` → `instrument_key`.
- **Python endpoint**: `POST /api/instrument-keys` resolves symbols → `NSE_EQ|ISIN` keys (8635 entries).
- **API route fix**: `/api/live` route now resolves all scanner symbols via Python before passing to orchestrator. `ScannerStock` type gained optional `instrumentKey` field.
- **Initial feed is always empty**: `initial_feed` contains structure-only placeholders (empty LTPC). Real data arrives in `live_feed` messages.
- **Results**: 135 ticks in 20s from 2 equities + 1 index. Nifty 50 ticks every ~300ms. Equities tick every 1-3s.
- **`ltpc` mode works**: Sends LTP, LTT, LTQ, CP correctly. No need for `full` mode.
- **Ping/pong**: Upstox sends pings every 5 seconds — handled automatically.
- **All docs**: `docs/steps/step14_live_trader_plan_9June26.md` — Live trader architecture, all 18 modules, streaming status
