# Complete Rebuild Roadmap V2: Correct Implementation Order
## As of 8 June 2026 — Based on full codebase audit of 200+ config points
## Architecture: Next.js (Frontend + Live Trader) + Python (Data Microservice)

---

## 🎯 PRINCIPLE
This is the **exact order this project was actually built in**, corrected with lessons learned. No theory. No shortcuts. This is the only order that works.

Every single phase works independently. You will have a usable working system after every step.

**Architecture Split:**
- **Next.js (Port 3000)** — Frontend + Live Trader (Node.js WebSocket, state machines, paper trader)
- **Python FastAPI (Port 8001)** — Data microservice (scanner, bhavcopy, VAH, breadth)
- **Shared SQLite DB** — Settings, trade logs, cache index

**Auto-launch:** `npm run dev` uses `concurrently` to spawn all processes.

---

---

## ✅ PHASE 0: FOUNDATION
**Goal:** Empty working project structure with auto-launch

| Task | What | Where |
|------|------|-------|
| 1 | Initialize Next.js project (App Router + TypeScript) | `npx create-next-app@latest` |
| 2 | Initialize Python FastAPI project with health check endpoint | `server.py` in root |
| 3 | Setup `concurrently` for auto-launch (`npm run dev` starts both) | `package.json` scripts |
| 4 | Health check polling — Next.js waits for Python `/health` before showing UI | Frontend `layout.tsx` |
| 5 | Setup shared SQLite database with `settings` table | `data/settings.db` |
| 6 | Setup project folder structure for Next.js + Python | See structure below |
| 7 | Setup ShadCN UI or MUI theme (dark mode default) | `app/globals.css` |

```json
// package.json scripts
{
  "dev": "concurrently -n next,py -c cyan,green \"next dev\" \"python server.py\"",
  "build": "next build",
  "start": "concurrently \"next start\" \"python server.py\""
}
```

✅ **At end of Phase 0:** You run `npm run dev`, Next.js starts on 3000, Python starts on 8001. Frontend shows "All systems connected" green indicator. You can stop here and have a working scaffold.

### Project Structure After Phase 0
```
MA_Stock_Trader/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout with nav + health check
│   ├── page.tsx            # Dashboard
│   └── api/                # API routes
│       └── health/route.ts # Proxies to Python health check
├── lib/
│   ├── db/
│   │   ├── settings.ts     # SQLite settings table access
│   │   └── schema.ts       # DB schema init
│   └── live-trader/        # (placeholder for Phase 5+)
├── data/                   # Runtime data
│   └── settings.db         # Shared SQLite database
├── server.py               # Python FastAPI (same as before)
├── src/                    # Python source (same as before)
├── package.json            # With concurrently scripts
└── tsconfig.json
```

---

## ✅ PHASE 0.5: DATA PIPELINE (MOST IMPORTANT PHASE)
**Goal:** Working data storage system. **You cannot build anything else until this is 100% perfect.**

| Task | Backend (Python) | Frontend (Next.js) |
|------|------------------|-------------------|
| 1 | Implement Cache Manager with .pkl file storage | Cache status page showing file count + last date |
| 2 | Implement Bhavcopy downloader (4-layer fallback) | Last update timestamp indicator |
| 3 | Implement Bhavcopy processor and normalizer | "Update Bhavcopy" button |
| 4 | Implement incremental cache update logic | Progress bar with ETA |
| 5 | Smart gap detection and filling | Data gap reporting (missing dates) |
| 6 | Store cache index in shared SQLite DB | Cache health score display |

✅ **At end of Phase 0.5:** You click "Update Data" button. Python downloads NSE bhavcopy, processes it, stores to cache. Progress updates stream to frontend. This is 50% of the entire project.

**DO NOT PROCEED TO ANY OTHER PHASE UNTIL THIS IS PERFECT.**

---

## ✅ PHASE 1: DATA PROCESSING
**Goal:** Technical indicator calculation

| Task | Backend (Python) | Frontend (Next.js) |
|------|-----------------|-------------------|
| 1 | Implement Data Fetcher (cache-first, API fallback) | Stock chart page with price history |
| 2 | Technical indicators (MA, ADR, Volume) | Indicator overlay on chart |
| 3 | Filter Engine base filters (price, volume, ADR) | Filter configuration read from DB |
| 4 | Liquidity validation logic | Stock quality scoring display |

**Key change from original:** Filter thresholds now read from `settings` DB table instead of being hardcoded.

✅ **At end of Phase 1:** You can load any stock, see all calculated indicators. Filter params are in the DB, not in source files.

---

## ✅ PHASE 1.5: SETTINGS ENGINE (NEW)
**Goal:** Every parameter that previously required file-editing is now editable from the UI.

| Task | Backend (Python + DB) | Frontend (Next.js) |
|------|---------------------|-------------------|
| 1 | Create `settings` DB table with schema (key, value, type, category, label) | Settings page layout with categorized sections |
| 2 | Settings API endpoints: `GET /api/settings`, `PUT /api/settings/:key` | Editable form fields (number, text, time, toggle) |
| 3 | Python reads settings from DB on startup + polls every 30s | Real-time save indicator ("Saved" / "Saving...") |
| 4 | Node.js live trader reads settings from DB on startup | Masked API key input with show/hide toggle |
| 5 | Seed default values for all 120 parameters | Validation — number ranges, time format, required fields |
| 6 | Settings migration system (version tracking) | "Reset to defaults" button per category |

### Settings Categories in UI:
| Tab | Parameters |
|-----|-----------|
| **Trading Schedule** | Market open, window length, prep time, entry time |
| **Risk Management** | Max positions, SL%, trailing threshold, drawdown limit |
| **Scanner — Continuation** | Price range, ADR, volume, MA threshold, body %, lookback |
| **Scanner — Reversal** | Price range, ADR, volume, decline %, decline days |
| **Volume Validation** | SVRO ratio, baseline days |
| **Connection** | WebSocket retries, API polling delays |
| **API Credentials** | Upstox key, secret, token (masked) |
| **Paper Trading** | Enable/disable toggle |

✅ **At end of Phase 1.5:** You can change any trading parameter from the Settings UI and it takes effect without editing a single file.

---

## ✅ PHASE 2: SCANNER SYSTEM
**Goal:** Working offline scanner

| Task | Backend (Python) | Frontend (Next.js) |
|------|-----------------|-------------------|
| 1 | Implement Continuation Analyzer (zig-zag pattern) | Scanner page with "Run Scan" button |
| 2 | Implement Reversal Analyzer (extended decline) | Scan progress bar with current stock count |
| 3 | Background task pattern (returns operation_id, polls status) | Results table (sortable, filterable) |
| 4 | Stock Scoring system (ADR, volume, price quality) | Download results as CSV |
| 5 | Scan history persistence in SQLite | Previous scans sidebar |
| 6 | Scanner parameters read from Settings DB | Scanner filter inputs pre-filled from settings |

**Key change from original:** Scanner thresholds (price range, ADR, volume, decline %, etc.) are NOT hardcoded. They come from the Settings DB. Changing a threshold in the Settings UI immediately affects the next scan.

✅ **At end of Phase 2:** You click "Run Scan", it runs in background, shows stock list with scores. You can save results, export CSV. This is 100% usable. You can stop here and have a better system than 90% of retail traders.

---

## ✅ PHASE 3: MARKET CONTEXT
**Goal:** Market breadth analysis

| Task | Backend (Python) | Frontend (Next.js) |
|------|-----------------|-------------------|
| 1 | Market Breadth Calculator (up/down 4.5%, above/below MA) | Breadth dashboard with color-coded table |
| 2 | Market sentiment indicators | Breadth history line chart (7-day trend) |
| 3 | Daily reporting system with PDF/CSV export | Date range selector for historical breadth |

✅ **At end of Phase 3:** You have full market context — you can see what the overall market is doing before picking individual stocks.

---

## ✅ PHASE 3.5: LIVE TRADER — NODE.JS FOUNDATION (NEW)
**Goal:** Live trader running inside Next.js, with WebSocket to Upstox and streaming to frontend.

This phase moves the live trading engine from Python to Node.js, running inside the Next.js server process.

| Task | Implementation |
|------|---------------|
| 1 | Create `lib/live-trader/` module structure | See structure below |
| 2 | Install `ws` and `protobuf.js` for WebSocket + protobuf | `npm install ws protobuf` |
| 3 | Implement `streamer.ts` — WebSocket client to Upstox Market Data Feed V3 | Same logic as `simple_data_streamer.py` |
| 4 | Set up subscription management (instrument keys, subscribe/unsubscribe) | Same as `subscription_manager.py` |
| 5 | Create WebSocket endpoint in Next.js for pushing ticks to frontend | `app/api/live/ws/route.ts` |
| 6 | Build live prices table in frontend — updates in real-time | React state updated via WebSocket messages |

### Live Trader Module Structure
```
lib/live-trader/
├── index.ts              — start(), stop(), getStatus()
├── streamer.ts           — Upstox WebSocket client (protobuf → JSON)
├── tick-processor.ts     — Per-stock O(1) price handlers
├── state-machine.ts      — Enum-based FSM (REVERSAL + CONTINUATION)
├── subscription-manager.ts — Dynamic subscribe/unsubscribe lifecycle
├── paper-trader.ts       — In-memory positions + SQLite logging
├── config.ts             — Reads settings from DB on startup
└── types.ts              — TypeScript interfaces for all state objects
```

✅ **At end of Phase 3.5:** Live prices for all subscribed stocks stream to the frontend in real-time. No polling. No separate Python process for ticks.

---

## ✅ PHASE 4: LIVE DATA FEED — INTEGRATION
**Goal:** Full integration — WebSocket streaming with state machine awareness

| Task | Implementation |
|------|---------------|
| 1 | Stock State Machine for reversal (same as current `state_machine.py`) | Enum: INITIALIZED → GAP_VALIDATED → QUALIFIED → MONITORING → ENTERED → EXITED |
| 2 | Stock State Machine for continuation | Same pattern but with VAH validation states |
| 3 | Gap validation logic (reads gap threshold from Settings DB) | Validates IEP vs previous close |
| 4 | Volume profile tracking for VAH | VAH value from Python, stored in DB, read by Node.js |
| 5 | Entry level tracking (daily high/low) | Real-time update in React state |
| 6 | Live monitoring dashboard with per-stock cards | State indicator, current price, entry/SL levels |

**Data flow:** Settings DB → Node.js live trader → WebSocket → Frontend React state

✅ **At end of Phase 4:** The bot watches all stocks. It tells you entry signals in real-time. You can trade manually based on signals.

---

## ✅ PHASE 5: AUTOMATED TRADING
**Goal:** Paper trading mode — fully automated

| Task | Implementation |
|------|---------------|
| 1 | Rule Engine — entry trigger logic (price crosses above entry_high) | Same as `rule_engine.py` but in TypeScript |
| 2 | Paper Trader — position tracking, P&L calculation | In-memory Map<symbol, Position> + SQLite persistence |
| 3 | Entry logic: OOPS (price > previous_close) + Strong Start (price > daily_high) | Same as `tick_processor.py` entry handlers |
| 4 | Exit logic: trailing SL at 5% profit, hard SL at 4% | Reads thresholds from Settings DB |
| 5 | First-come-first-serve: unsubscribe remaining after 2 positions filled | Same as current logic |
| 6 | Active positions dashboard in frontend | Real-time P&L, entry time, SL level |
| 7 | Trade log table with filter/sort | Entry price, exit price, P&L%, duration |

✅ **At end of Phase 5:** Fully working automated paper trading bot. Runs when you start it from the UI, stops when you click stop. All trades logged. This is a complete usable system.

---

## ✅ PHASE 6: STOCK LIST MANAGEMENT
**Goal:** Full CRUD for trading lists from the UI

| Task | Backend (Python/DB) | Frontend (Next.js) |
|------|-------------------|-------------------|
| 1 | Store trading lists in SQLite (`trading_lists` table) | Stock list management page |
| 2 | Support symbol postfix notation (`-d13`, `-u11`, `-situation`) | Add/remove stocks with situation dropdown |
| 3 | Persist lists to `.txt` files for Python scanner reading | Drag-and-drop reorder stocks |
| 4 | Import from scan results (one-click add from scan table) | "Add to Watchlist" button in scan results |

✅ **At end of Phase 6:** You manage all trading lists from the UI. No file editing needed.

---

## ✅ PHASE 7: VAH & VOLUME PROFILE
**Goal:** VAH calculation integrated into the live trader flow

| Task | Where | Details |
|------|-------|---------|
| 1 | Python calculates VAH from previous day's volume profile | Same `volume_profile.py` logic |
| 2 | VAH results stored in shared SQLite DB | New `vah_results` table |
| 3 | Node.js live trader reads VAH at startup | Pre-market validation phase |
| 4 | VAH rejection check in state machine | `open_price >= vah_price` gate |
| 5 | VAH results displayed in frontend | Per-stock VAH level on monitoring cards |

✅ **At end of Phase 7:** VAH is calculated by Python, consumed by Node.js trader, displayed in frontend.

---

## ✅ PHASE 8: AUTO-LAUNCH & DEVELOPER EXPERIENCE (NEW)
**Goal:** One command runs everything. Process management, health monitoring, seamless restart.

| Task | Details |
|------|---------|
| 1 | `concurrently` with named processes and color-coded output | `[next]`, `[trader]`, `[python]` |
| 2 | Python auto-launch with health check retry (3 attempts, 2s apart) | Frontend shows connection status |
| 3 | Live trader auto-restart on crash (PM2 or Node.js child process respawn) | Zero-downtime recovery |
| 4 | Graceful shutdown — Ctrl+C kills all processes in order | trader → python → next |
| 5 | Dev mode vs production mode scripts | `npm run dev` (hot reload) vs `npm start` (production) |
| 6 | `.env.local` for API keys with example `.env.example` | No more upstox_config.json in repo |

### Scripts After Phase 8
```json
{
  "scripts": {
    "dev": "concurrently -n next,py -c cyan,green \"next dev\" \"python server.py\"",
    "dev:live": "concurrently -n next,trader,py -c cyan,yellow,green \"next dev\" \"node live-trader.mjs\" \"python server.py\"",
    "build": "next build",
    "start": "concurrently -n next,trader,py \"next start\" \"node live-trader.mjs\" \"python server.py\"",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

✅ **At end of Phase 8:** You run `npm run dev`, everything starts. Green indicators show all three services are healthy.

---

## ✅ PHASE 9: PRODUCTION HARDENING (was Phase 7)
**Goal:** Real money ready

| Task | Where | Details |
|------|-------|---------|
| 1 | Error boundaries in React for all pages | Frontend never shows white screen |
| 2 | Circuit breakers — stop trading on 5% drawdown | Reads max_drawdown from Settings DB |
| 3 | Rate limiting on API routes | Next.js middleware |
| 4 | Persistent state store — bot state survives restart | SQLite stores current state |
| 5 | Performance metrics dashboard | Win rate, avg P&L, max drawdown chart |
| 6 | Audit logs for all config changes | `settings_audit` table tracks who changed what |
| 7 | Bot health monitoring with alerts | "Bot stopped" notification in UI |

✅ **At end of Phase 9:** Production grade system ready for real money.

---

---

## 🎯 PHASE OVERVIEW (All 10 Phases)

| Phase | Name | Duration | Frontend | Backend |
|-------|------|----------|----------|---------|
| 0 | Foundation | 1 day | Next.js setup + nav | Python FastAPI + health |
| 0.5 | Data Pipeline | 7 days | Cache status UI | Bhavcopy + Cache Manager |
| 1 | Data Processing | 3 days | Stock chart page | Indicators + Filters |
| **1.5** | **Settings Engine** | **4 days** | **Settings panel** | **DB-backed config API** |
| 2 | Scanner System | 3 days | Scan results table | Continuation + Reversal analyzers |
| 3 | Market Context | 2 days | Breadth dashboard | Market breadth calculator |
| **3.5** | **Live Trader (Node.js)** | **3 days** | **Live prices table** | **WebSocket client + state machine** |
| 4 | Live Data Integration | 2 days | Monitoring dashboard | FSM + gap/VAH validation |
| 5 | Automated Trading | 4 days | Positions + trade log | Paper trader + entry/exit logic |
| 6 | Stock List Mgmt | 1 day | Watchlist CRUD | DB-backed list persistence |
| 7 | VAH Integration | 2 days | VAH display on cards | Python VAH → DB → Node.js |
| **8** | **Auto-Launch & DX** | **1 day** | **Connection indicators** | **concurrently scripts** |
| 9 | Production Harden | 3 days | Error boundaries, audits | Circuit breakers, rate limits |

**Total:** 36 days (1-2 hours per day)

---

## 🎯 NON NEGOTIABLE RULES

✅ **Never work on Phase N before Phase N-1 is 100% working, tested and usable**

✅ **You must be able to stop at any phase and still have a useful system**

✅ **Frontend always follows backend. Never build frontend features before backend API exists.**

✅ **Data pipeline is 50% of the work. It is also responsible for 90% of the bugs.**

✅ **All configuration lives in the database, not in source files.** If you need to edit a .py or .ts file to change a parameter, that's a bug.

✅ **Python does data. Node.js does live events.** The two should never compete for the same CPU core.

---

## 💡 LESSON FROM ORIGINAL PROJECT

This is exactly what was done wrong in the original codebase:

| Mistake | Consequence |
|---------|-------------|
| ❌ Started with scanner first | Spent 3 months fighting caching bugs |
| ❌ All config hardcoded in 30+ files | Every parameter change required code edit |
| ❌ WebSocket + scanner in same process | GIL contention — ticks delayed during scans |
| ❌ Frontend polled /api/live-trading/logs every 500ms | 500ms delay on every UI update |
| ❌ Same logic duplicated across two bot files | fix one, forget the other — 4 regression cycles |
| ❌ Data pipeline was an afterthought | Had to rewrite everything from scratch |

This roadmap avoids all of that. **Phase 0.5 (data pipeline) is done first. Phase 1.5 (settings engine) ensures no more file editing. Phase 3.5 (Node.js live trader) separates live events from data crunching.**

---

## 📈 TIME ESTIMATES (Updated for New Phases)

| Phase | Time Required | Working System After? |
|-------|---------------|----------------------|
| Phase 0 | 1 day | ✅ Empty project with health check |
| Phase 0.5 | 7 days | ✅ Data pipeline works |
| Phase 1 | 3 days | ✅ Indicators calculated |
| Phase 1.5 | 4 days | ✅ All config in UI |
| Phase 2 | 3 days | ✅ Scanner works |
| Phase 3 | 2 days | ✅ Market context visible |
| Phase 3.5 | 3 days | ✅ Live prices streaming |
| Phase 4 | 2 days | ✅ State machines active |
| Phase 5 | 4 days | ✅ Paper trading automated |
| Phase 6 | 1 day | ✅ Lists managed from UI |
| Phase 7 | 2 days | ✅ VAH integrated |
| Phase 8 | 1 day | ✅ One-command launch |
| Phase 9 | 3 days | ✅ Production ready |

**Total:** 36 days total working 1-2 hours per day.
