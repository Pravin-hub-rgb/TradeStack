# Step 16: Trade Logs + GitHub-Style P&L Heatmap (13 June 2026)

## What We Built

A **Trade Logs** sub-tab inside the Live Trading dashboard with three parts:

| Part | Description |
|------|-------------|
| **Stats Card** | Total trades entered, active count, this month's entries, capital (₹100,000) |
| **GitHub-Style Heatmap** | Contribution-style grid per month — each day colored by number of entries, prev/next navigation |
| **Trade Table** | Full trade history: symbol, entry price, SL, date/time, status |

## Architecture

```
LiveTrader (Node.js)
  └-> PaperTrader.logEntry()
       └-> POST /api/trades/log-entry  ──>  Python FastAPI
                                              └-> db.add_trade_log()
                                                   └-> settings.db.trade_log

Frontend (Next.js)
  └-> TradeLogs tab
       ├-> GET /api/trades/stats       ──>  Python FastAPI  ──>  db.get_trade_stats()
       ├-> GET /api/trades/daily-count  ──>  Python FastAPI  ──>  db.get_daily_entry_counts()
       └-> GET /api/trades/list         ──>  Python FastAPI  ──>  db.get_trade_logs()
```

## Files Changed

| File | What | Lines |
|------|------|-------|
| `backend/src/db.py` | Added `trade_log` table to schema, 4 CRUD functions | +50 |
| `backend/server.py` | Added 4 API endpoints + import | +45 |
| `frontend/src/lib/live-trader/paper-trader.ts` | `logEntry()` now POSTs to Python API | +14 |
| `frontend/src/components/live-trading/TradeLogs.tsx` | **New** — Heatmap + stats + table component | ~200 |
| `frontend/src/components/LiveTrading.tsx` | Added "Trade Logs" tab with icon | +6 |

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS trade_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL,
    instrument_key  TEXT,
    entry_price     REAL,
    entry_sl        REAL,
    entry_time      TEXT,
    entry_date      TEXT,
    session_id      TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/trades/log-entry` | PaperTrader records an entry |
| `GET` | `/api/trades/list?start_date=&end_date=` | Fetch trade history |
| `GET` | `/api/trades/daily-count?year=&month=` | Day-by-day entry counts for heatmap |
| `GET` | `/api/trades/stats` | Cumulative stats (total/active/daily breakdown) |

## Key Decisions

1. **Entry-only logging** — Paper trader no longer tracks exits/P&L. Bot enters + sets SL, user manages rest on phone.
2. **Capital = ₹100,000 fixed** — No compounding yet (can be added later when manual P&L reporting is built).
3. **Heatmap = entry count per day** — Color intensity indicates number of trades entered that day. Grey = no trades.
4. **Node.js writes via Python API** — PaperTrader in Next.js calls `POST /api/trades/log-entry` on the Python microservice. Clean separation, no direct SQLite from Node.js.
5. **No exit/P&L tracking** — Since user manually manages exits, the bot has no exit data to log.

## Verification

```powershell
cd MA_Stock_Trader_NA\backend
.\venv\Scripts\python -c "from src.db import *; print('trade_log table OK')"

cd MA_Stock_Trader_NA\frontend
bun run build   # Zero TS errors
```

---

## 🎓 Learning From This Step

| Technology | What It Is | Suggested Learning Project | Focus Area |
|------------|-----------|---------------------------|------------|
| GitHub Contribution Graph | Visual heatmap grid showing daily activity density | Build a personal habit tracker with grid visualization | SVG grid rendering, color scales, date arithmetic |
| SQLite `AUTOINCREMENT` | Auto-incrementing integer primary key | Build a simple journal app with auto-ID entries | Primary key strategies, `lastrowid` |
| FastAPI `str \| None` | Python 3.10+ union type syntax for optional params | Refactor an existing API to use pipe syntax | Type annotations, `Optional` vs `\| None` |
| Tooltip hover UX | MUI `Tooltip` for contextual info on hover | Add tooltips to all data visualization elements | `Tooltip` placement, delay, custom content |
| `fetch().catch(() => {})` | Fire-and-forget HTTP call (no await, no error noise) | Build a logging middleware that never blocks | Error swallowing patterns, fire-and-forget in Node.js |
