# TradeStack — Learning Curriculum V2
## As of 8 June 2026

---

## How This Works

Every step in the rebuild introduces new concepts. At the bottom of each step's document, there is a **🎓 Learning From This Step** table that lists:

- **Concept Used** — What technology or pattern was introduced
- **What It Is** — 2-line explanation
- **Suggested Learning Project** — A small project you build on your own to learn the concept
- **Focus Area** — What specific aspect to pay attention to

You build the suggested projects **separately** (in a `learning/` folder or anywhere on your machine) at your own pace. When you come back to the TradeStack code, you'll recognize the concepts because you've used them before.

---

## Master Concept Map

This table maps every technology used in the project to where it appears and what you should build to learn it.

---

### Backend: Python Ecosystem

| # | Concept | Introduced In Step | Suggested Simple Project | Suggested Moderate Project | Focus Areas |
|---|---------|-------------------|------------------------|---------------------------|-------------|
| 1 | **Python Basics** | Step 1 | CLI calculator (add/sub/multiply/div, read input) | File-based to-do list (add/list/complete tasks, save to JSON) | Functions, dicts/lists, file I/O, error handling |
| 2 | **Virtual Environments** | Step 1 | — (concept only) | — | Why isolate dependencies, venv vs pipenv vs poetry |
| 3 | **FastAPI** | Step 1 | Calculator API (4 endpoints, path/query params) | URL Shortener (POST to create, GET to redirect, SQLite storage) | Path params, query params, request body, auto docs at /docs |
| 4 | **Uvicorn** | Step 1 | — (just the runner, no separate project) | — | ASGI vs WSGI, reload mode, host/port config |
| 5 | **Pydantic** | Step 1 | Add BaseModel validation to the Calculator API | — | Field types, validation, nested models |
| 6 | **Pandas** | Step 2 | Weather CSV analyzer (load CSV, calculate mean/max/min, filter rows) | Stock screener CLI (load 100 stocks, calculate MA, filter by criteria) | DataFrame, read_csv, filtering, groupby, rolling windows |
| 7 | **NumPy** | Step 2 | Array operations (create arrays, reshape, basic math) | — | ndarray, broadcasting, vectorized operations |
| 8 | **CORS Middleware** | Step 2 | Add CORS to Calculator API, test from a simple HTML page | — | Same-origin policy, allowed origins, methods, headers |
| 9 | **Background Tasks** | Step 3 | API endpoint that runs a long task and returns status immediately | — | BackgroundTasks, polling pattern, operation_id |
| 10 | **REST API Design** | Step 2-3 | Design and build a full CRUD API for a library (books, authors) | — | Resource naming, status codes, pagination, error responses |
| 11 | **File Caching (Pickle/JSON)** | Step 3 | API that caches expensive computation results to disk | — | Cache invalidation, serialization, staleness checks |
| 12 | **WebSocket** | Step 5 | Chat room (broadcast messages to all connected clients) | Live crypto ticker (connect to exchange WS, display prices) | ws library, on_message, on_open, on_close, reconnection |
| 13 | **State Machine** | Step 5 | Traffic light FSM (3 states: green→yellow→red→green, timer transitions) | Vending machine FSM (idle→coin→select→dispense, edge cases) | Enum states, transitions, guards, state-dependent behavior |
| 14 | **Subprocess Management** | Step 6 | Launch a background worker script, check its status | Bot manager (start/stop/monitor N workers, log output) | subprocess.Popen, polling stdout, graceful kill |
| 15 | **Singleton Pattern** | Step 6 | File-lock based singleton for a script | — | Lock files, race conditions, PORTALOCKER |
| 16 | **Exponential Backoff** | Step 5 | Retry loop that doubles delay each attempt | — | Retry patterns, jitter, max retries |
| 17 | **Async/Await** | Step 2 | Convert a sync API endpoint to async, add simulated delays | — | async def, await, event loop vs threading |
| 18 | **SQLite** | Step 4 | Address book (CRUD operations, search by name) | — | sqlite3 module, CREATE/INSERT/SELECT/UPDATE |

---

### Frontend: React / Next.js / TypeScript

| # | Concept | Introduced In Step | Suggested Simple Project | Suggested Moderate Project | Focus Areas |
|---|---------|-------------------|------------------------|---------------------------|-------------|
| 19 | **TypeScript Basics** | Step 1 | Convert 3 JS functions to TS with type annotations | — | Basic types, interfaces, type inference |
| 20 | **React Components** | Step 2 | Counter button (click increments display) | — | Components, props, JSX |
| 21 | **useState & useEffect** | Step 2 | Fetch and display data from an API (loading/error/data states) | — | State lifecycle, effect dependencies, cleanup |
| 22 | **React Context API** | Step 4 | Theme toggle (light/dark mode via Context, all components consume it) | Multi-step form (wizard with Context for shared state, useReducer for complex state) | createContext, useContext, Provider pattern, useReducer |
| 23 | **Next.js App Router** | Step 1 | 3-page info site with shared layout and navigation | Dashboard page with dynamic routes (`/stock/[symbol]`) | file-based routing, layout.tsx, loading.tsx, error.tsx |
| 24 | **Next.js API Routes** | Step 4 | API route that reads from SQLite and returns JSON | — | Route handlers, request/response, db access |
| 25 | **Tailwind CSS** | Step 1 | Style the 3-page info site with Tailwind | — | Utility classes, responsive design, dark mode |
| 26 | **Server Components vs Client Components** | Step 2 | Understand the difference by building a page that mixes both | — | 'use client' directive, when to use each |
| 27 | **fetch API / Axios** | Step 2 | Fetch data from your FastAPI Calculator API and display it | — | GET/POST, async/await, error handling, loading states |
| 28 | **Polling Pattern** | Step 3 | Poll a background task status endpoint every 2s and show progress bar | — | setInterval, cleanup, UX during loading |

---

### Live Trading Concepts

| # | Concept | Introduced In Step | Suggested Simple Project | Suggested Moderate Project | Focus Areas |
|---|---------|-------------------|------------------------|---------------------------|-------------|
| 29 | **OHLC Data** | Step 2 | Parse a CSV with timestamp, open, high, low, close | — | What each field means, candle anatomy |
| 30 | **Moving Averages** | Step 2 | Calculate SMA-20 for a stock price series | — | Rolling windows, SMA vs EMA, crossover signals |
| 31 | **ADR (Average Daily Range)** | Step 2 | Calculate 14-day ADR for a stock | — | Range = high - low, mean over period |
| 32 | **Volume Analysis** | Step 3 | Calculate average volume over 10 days, compare to daily volume | — | Volume spikes, relative volume, baseline |
| 33 | **Volume Profile / VAH** | Step 5 | Calculate which price levels had the most volume in a day | — | Price bins, volume accumulation, value area |
| 34 | **Tick vs OHLC Data** | Step 5 | Compare raw tick data vs 1-minute OHLC candles | — | Tick = every trade, OHLC = aggregated, tradeoffs |
| 35 | **Gap Analysis** | Step 5 | Calculate gap % between previous close and current open | — | Gap up vs gap down, flat gap, significance |
| 36 | **Continuation Pattern** | Step 3 | Identify if a stock is in an uptrend with a pullback | — | Higher highs, higher lows, MA slope, pullback depth |
| 37 | **Reversal Pattern** | Step 3 | Identify if a stock has declined X days in a row with Y% drop | — | Red candle streak, decline %, climax bar |
| 38 | **IEP (Indicative Equilibrium Price)** | Step 5 | Fetch pre-market IEP for a stock from API | — | What IEP represents, pre-market vs open |
| 39 | **Position Sizing** | Step 6 | Calculate position size based on account risk % and stop loss % | — | Risk per trade, stop loss distance, quantity |
| 40 | **Trailing Stop Loss** | Step 5 | Implement a trailing SL that moves to breakeven at 5% profit | — | Activation threshold, lock profits, SL never moves down |

---

## Suggested Learning Order

This order minimizes dependencies — each concept builds on previous ones.

### Phase A: Python Foundation (Do these first)
| Order | Concept | Step # | Est. Time |
|-------|---------|--------|-----------|
| 1 | Python Basics | 1 | 3 days |
| 2 | FastAPI + Uvicorn + Pydantic | 1 | 2 days |
| 3 | REST API Design | 2 | 1 day |
| 4 | Async/Await | 2 | 1 day |

Build: **Calculator API** project. Then move on.

### Phase B: Data Processing
| Order | Concept | Step # | Est. Time |
|-------|---------|--------|-----------|
| 5 | Pandas + NumPy | 2 | 4 days |
| 6 | OHLC Data + MA + ADR | 2 | 2 days |

Build: **Weather CSV Analyzer** → **Stock Screener CLI**.

### Phase C: React & Next.js
| Order | Concept | Step # | Est. Time |
|-------|---------|--------|-----------|
| 7 | TypeScript Basics | 1 | 1 day |
| 8 | React Components + State | 2 | 2 days |
| 9 | Next.js App Router | 1 | 2 days |
| 10 | Tailwind | 1 | 1 day |
| 11 | Context API + useReducer | 4 | 2 days |
| 12 | API Routes | 4 | 1 day |
| 13 | Polling Pattern | 3 | 1 day |

Build: **Theme Toggle** → **Multi-step Form** → **Dashboard with API data**.

### Phase D: Real-Time & State
| Order | Concept | Step # | Est. Time |
|-------|---------|--------|-----------|
| 14 | WebSocket | 5 | 2 days |
| 15 | State Machine | 5 | 2 days |
| 16 | Exponential Backoff | 5 | 1 day |
| 17 | Gap Analysis + IEP | 5 | 1 day |
| 18 | Tick vs OHLC | 5 | 1 day |

Build: **Chat Room** → **Vending Machine FSM**.

### Phase E: Integration & Production
| Order | Concept | Step # | Est. Time |
|-------|---------|--------|-----------|
| 19 | CORS | 2 | 0.5 day |
| 20 | Background Tasks | 3 | 1 day |
| 21 | File Caching | 3 | 1 day |
| 22 | SQLite | 4 | 1 day |
| 23 | Subprocess Management | 6 | 1 day |
| 24 | Singleton + Lock Files | 6 | 0.5 day |
| 25 | Position Sizing + Trailing SL | 5-6 | 1 day |

---

## Total Estimated Learning Time

| Phase | Projects | Days |
|-------|----------|------|
| A — Python Foundation | Calculator API | 7 |
| B — Data Processing | Weather Analyzer + Stock Screener | 6 |
| C — React & Next.js | Theme Toggle + Form + Dashboard | 9 |
| D — Real-Time & State | Chat Room + Vending Machine | 6 |
| E — Integration | Various small | 5 |
| **Total** | ~9 projects | **~33 days** |

At 1-2 hours per day, this is about 1 month of learning before you'll recognize every piece of the TradeStack codebase.

---

## How to Use This

1. **Pick a concept** from the table above
2. **Read the docs** linked in the step document
3. **Build the simple project** (1-2 hours)
4. **Build the moderate project** (3-5 hours) — optional, for deeper understanding
5. **Open TradeStack** and find the real usage — the step doc tells you which file
6. **Move to the next concept**

You don't need to build all 9+ projects before touching the rebuild. The rebuild's step documents will tell you exactly which concepts you need for that step. Learn just enough to be dangerous, then build.
