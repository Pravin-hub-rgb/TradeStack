# Step 14: Live Trader — Node.js Foundation + Frontend (Phase 3.5)

**Date:** 9–10 June 2026

## Goal

Build the live trading engine inside Next.js as a **pure Node.js process** — WebSocket client to Upstox Market Data Feed V3, per-stock state machines, tick processors, subscription management, paper trading, and a 3-tab frontend dashboard. Exact copy of old Python system logic, running in TypeScript.

## Architecture

```
frontend/src/lib/live-trader/
├── index.ts                  # Orchestrator — start(), stop(), getStatus()
├── types.ts                  # All shared interfaces + enums
├── config.ts                 # Reads settings from SQLite DB
├── streamer.ts               # Upstox WebSocket (protobuf → JSON)
│
├── reversal/
│   ├── state-machine.ts      # 11-state StockState enum + StateMachineMixin
│   ├── stock-monitor.ts      # ReversalStockState + ReversalStockMonitor
│   ├── tick-processor.ts     # OOPS + Strong Start entry/exit logic
│   ├── subscription-mgr.ts   # Phased unsubscribe (gap, low, exited)
│   └── integration.ts        # Wires tick handler → processors → paper trader
│
├── continuation/
│   ├── state-machine.ts      # Same 11-state FSM (replaces boolean flags)
│   ├── stock-monitor.ts      # StockState + StockMonitor (with volume, VAH)
│   ├── tick-processor.ts     # SVRO continuation entry/exit logic
│   ├── subscription-mgr.ts   # Phased unsubscribe (gap+VAH, low+volume, FCFS)
│   └── integration.ts        # Wires tick handler → processors → paper trader
│
├── paper-trader.ts           # In-memory trade logging (entries, exits, rejections)
└── volume-profile.ts         # (pending) Calls Python /api/volume-profile for VAH

frontend/src/
├── app/api/live/route.ts     # REST API: GET /api/live (status), POST (start/stop/load)
├── components/LiveTrading.tsx # 3-tab UI: Token Session, List Validation, Live Trading
└── app/live-trading/page.tsx # Route page
```

## Build Order (Completed)

| # | File | Lines | What It Does |
|---|------|-------|-------------|
| 1 | `types.ts` | 175 | All enums (StockStateEnum, ReversalSituation, etc.) + interfaces (TickData, FeedResponse, LiveTraderConfig, Trade, SessionStats, ScannerResult) |
| 2 | `config.ts` | 80 | Read settings from SQLite via `/api/settings`, parse times, provide defaults |
| 3 | `streamer.ts` | 250 | WebSocket client using `ws` + `protobufjs`: connect, subscribe, unsubscribe, exponential backoff reconnect (5s–80s, 5 attempts), message parsing (FeedResponse → TickData). Public properties: `onTick`, `onStatus`, `onReconnect`, `onClose` |
| 4 | `reversal/state-machine.ts` | 205 | `StateMachineMixin` class with `_transition_to()`, `validate_gap()` (S1 needs gap up 0–5%, S2 needs gap down >0.5%), `check_low_violation()` (<1% below open), `reject()`, `prepare_entry()` (Strong Start / OOPS), `enter_position()`, `exit_position()`, `mark_not_selected()`, `mark_selected()`, `can_transition_to()`, `update_entry_levels()` |
| 5 | `reversal/stock-monitor.ts` | 162 | `ReversalStockState` extends `StateMachineMixin`: symbol, instrument_key, previous_close, situation (s1/s2), open_price, daily_high/low, entry_high/sl, position data, rejection_reason, entryLogged. `ReversalStockMonitor`: Map<key, ReversalStockState>, add/remove/get_active/get_qualified/prepare_entries/check_entry_signals |
| 6 | `reversal/tick-processor.ts` | 99 | `ReversalTickProcessor`: `process_tick(price, timestamp)` → `_track_entry_levels()` (high/low updates, low violation), `_handle_entry_monitoring()` (OOPS: cross previous close, Strong Start: cross daily high), `_handle_exit_monitoring()` (trailing SL at 5%, exit at SL hit) |
| 7 | `reversal/subscription-mgr.ts` | 110 | `SubscriptionManager`: `subscribe_all()`, `safe_unsubscribe()`, `unsubscribe_gap_rejected()`, `unsubscribe_low_violated()`, `unsubscribe_non_selected()`, `mark_stocks_unsubscribed()`, `log_status()` with per-state counts |
| 8 | `reversal/integration.ts` | 116 | `ReversalIntegration`: `simplified_tick_handler()` routes to per-stock processors, `_handle_paper_trading_logs()`, `_check_and_unsubscribe_after_positions_filled()` (when 2 entered, unsubscribe rest), `prepare_and_subscribe()`, `cleanup()` |
| 9 | `continuation/state-machine.ts` | 185 | Same 11-state FSM + adds `ContinuationStateMachineParams`, `validate_vah_rejection()` (open must be above VAH), `validate_volume()` (early volume / baseline >= minRatio), `validate_gap()` (gap up 0–5%), trailing SL at configurable threshold |
| 10 | `continuation/stock-monitor.ts` | 162 | `ContinuationStockState` extends `ContinuationStateMachine`: adds `processOHLC()`, earlyVolume, volumeBaseline. `StockMonitor`: `process_candle_data()`, `check_volume_validations()` with async `fetchVolume()` |
| 11 | `continuation/tick-processor.ts` | 48 | `ContinuationTickProcessor`: entry when price crosses above entry_high, trailing SL at threshold, exit at SL |
| 12 | `continuation/subscription-mgr.ts` | 100 | `ContinuationSubscriptionManager`: same pattern as reversal |
| 13 | `continuation/integration.ts` | 94 | `ContinuationIntegration`: same pattern + OHLC processing before tick handler |
| 14 | `paper-trader.ts` | 145 | `PaperTrader`: `log_entry(StockState, price, time)`, `log_exit()`, `log_rejection()`, `get_stats()` (SessionStats), `get_summary()` — in-memory trade array, capital tracking |
| 15 | `index.ts` | 200 | `LiveTraderOrchestrator`: `initialize(config, instruments)`, `start()` (sets up streamer callbacks, connects), `load_stocks_from_scanner(scannerResult)` (creates monitor + integration per mode), `stop()` (cleanup + disconnect), `getStatus()` |
| 16 | `app/api/live/route.ts` | 70 | REST API: `GET /api/live` returns status, `POST /api/live` with `{action: "start", mode}` / `{action: "stop"}` / `{action: "load", scannerResult}`. Singleton orchestrator instance. |
| 17 | `components/LiveTrading.tsx` | 540 | **3-tab UI**: Token Session (inline token validate/update), List Validation (validate stock lists from DB), Live Trading (mode selector, start/stop, paper stats, stock table with state chips). Polls `/api/live` every 2s. |
| 18 | `app/live-trading/page.tsx` | 5 | Renders `<LiveTrading />` component |

## What Was Built vs Not Yet

### ✅ All 18 TS library files complete
- types, config, streamer, all 10 reversal+continuation modules, paper-trader, index.ts

### ✅ Frontend done
- API route (`/api/live`), 3-tab UI (`LiveTrading.tsx`), route page (`/live-trading`)
- Token Session tab (inline, calls Python `/api/token/status` and `/api/token/validate`)
- List Validation tab (calls Python `/api/stock-list/{type}`)
- Live Trading tab (mode selector, start/stop, paper stats, stock table)

### 🔲 Not Yet Built
- `volume-profile.ts` — will call Python `/api/volume-profile` for VAH calculation
- Python pipeline endpoints — IEP batch fetch, instrument key mapping, LTP, volume, VAH
- Next.js WebSocket endpoint — `app/api/live/ws/route.ts` for real-time push to UI
- Tests — state machine unit tests, tick processor tests, integration tests

## Key Design Decisions

### 1. 11-State FSM (Both Bots)
Old reversal has formal FSM, continuation uses boolean flags. We standardize both to the same 11-state enum:

```
INITIALIZED → WAITING_FOR_OPEN → GAP_VALIDATED → QUALIFIED → SELECTED → 
MONITORING_ENTRY → ENTERED → MONITORING_EXIT → NOT_SELECTED / REJECTED / 
UNSUBSCRIBED / EXITED
```

Valid transitions enforced by `VALID_TRANSITIONS` map:
```
INITIALIZED              → WAITING_FOR_OPEN
WAITING_FOR_OPEN         → GAP_VALIDATED | REJECTED
GAP_VALIDATED            → QUALIFIED | REJECTED
QUALIFIED                → SELECTED | NOT_SELECTED | REJECTED
SELECTED                 → MONITORING_ENTRY
MONITORING_ENTRY         → ENTERED | REJECTED
ENTERED                  → MONITORING_EXIT
MONITORING_EXIT          → EXITED | REJECTED
NOT_SELECTED             → UNSUBSCRIBED
REJECTED                 → UNSUBSCRIBED
EXITED                   → UNSUBSCRIBED
UNSUBSCRIBED             → (terminal)
```

### 2. Per-Stock Tick Processors
Each stock gets its own `TickProcessor` instance. The integration layer routes ticks.

### 3. FCFS Entry
All qualified stocks stay subscribed until both positions are filled. When a stock crosses its entry threshold, it gets ENTERED. When both positions are filled, remaining stocks are unsubscribed.

### 4. Settings from DB
All hardcoded constants (ENTRY_SL_PCT, LOW_VIOLATION_PCT, etc.) move to `settings` SQLite table. `config.ts` reads them on startup via `/api/settings`.

### 5. Streamer Refactored to Public Properties
`onTick`, `onStatus`, `onReconnect`, `onClose` are public `TickHandler | null` properties (not setter methods), so the orchestrator assigns them directly: `streamer.onTick = (tick) => {...}`.

### 6. Frontend Communicates via Next.js API Route
The browser polls `GET /api/live` (Next.js route handler). The route maintains a singleton `LiveTraderOrchestrator` instance. Start/stop actions via `POST /api/live`.

### 7. Mode Selector: One at a Time
Old system uses radio buttons — either "Continuation Trading" or "Reversal Trading", never both. The orchestrator defaults to the selected mode. Radios are disabled while running.

## Old → New Mapping

| Old Python File | New TypeScript File | Status |
|----------------|-------------------|--------|
| `config.py` | `config.ts` | ✅ Done |
| `simple_data_streamer.py` | `streamer.ts` | ✅ Done |
| `reversal_stock_monitor.py` | `reversal/stock-monitor.ts` | ✅ Done |
| `reversal_modules/state_machine.py` | `reversal/state-machine.ts` | ✅ Done |
| `reversal_modules/tick_processor.py` | `reversal/tick-processor.ts` | ✅ Done |
| `reversal_modules/integration.py` | `reversal/integration.ts` | ✅ Done |
| `reversal_modules/subscription_manager.py` | `reversal/subscription-mgr.ts` | ✅ Done |
| `run_reversal.py` | `index.ts` (reversal part) | ✅ Done |
| `continuation_stock_monitor.py` | `continuation/stock-monitor.ts` | ✅ Done |
| `continuation_modules/tick_processor.py` | `continuation/tick-processor.ts` | ✅ Done |
| `continuation_modules/integration.py` | `continuation/integration.ts` | ✅ Done |
| `continuation_modules/subscription_manager.py` | `continuation/subscription-mgr.ts` | ✅ Done |
| `run_continuation.py` | `index.ts` (continuation part) | ✅ Done |
| `paper_trader.py` | `paper-trader.ts` | ✅ Done |
| `stock_classifier.py` | (uses existing `stock_list_items` DB table) | ✅ Done |
| `volume_profile.py` | `volume-profile.ts` (calls Python) | ⬜ Pending |
| `rule_engine.py` | (inline in state-machine.ts) | ✅ Done |
| `selection_engine.py` | (not used — FCFS only) | ❌ Skipped |
| `stock_scorer.py` | (not used — FCFS only) | ❌ Skipped |
| `LiveTrading.tsx` (React) | `LiveTrading.tsx` + `app/api/live/route.ts` | ✅ Done |
| `server.py` (start/stop endpoint) | `app/api/live/route.ts` | ✅ Done |

## Executable Checklist

- [x] **Step 1**: Create `lib/live-trader/` directory structure
- [x] **Step 2**: Write `types.ts` — all enums + interfaces
- [x] **Step 3**: Write `config.ts` — settings reader from SQLite
- [x] **Step 4**: Install `ws` + `protobufjs` packages
- [x] **Step 5**: Write `streamer.ts` — WebSocket client
- [x] **Step 6**: Write `reversal/state-machine.ts`
- [x] **Step 7**: Write `reversal/stock-monitor.ts`
- [x] **Step 8**: Write `reversal/tick-processor.ts`
- [x] **Step 9**: Write `reversal/subscription-mgr.ts`
- [x] **Step 10**: Write `reversal/integration.ts`
- [x] **Step 11**: Write `continuation/state-machine.ts`
- [x] **Step 12**: Write `continuation/stock-monitor.ts`
- [x] **Step 13**: Write `continuation/tick-processor.ts`
- [x] **Step 14**: Write `continuation/subscription-mgr.ts`
- [x] **Step 15**: Write `continuation/integration.ts`
- [x] **Step 16**: Write `paper-trader.ts`
- [ ] **Step 17**: Write `volume-profile.ts`
- [x] **Step 18**: Write `index.ts` — orchestrator
- [ ] **Step 19**: Add Python pipeline endpoints (`server.py`)
- [ ] **Step 20**: Write Next.js WebSocket endpoint
- [x] **Step 21**: Write `LiveTrading` UI component (3 tabs)
- [ ] **Step 22**: Write tests
- [x] **Step 23**: Update `/live-trading` page
- [x] **Step 24**: API route `app/api/live/route.ts`
- [ ] **Step 25**: End-to-end verification

## Testing Strategy (Pending)

1. **State machine tests**: Unit test all 11 states + valid transitions
2. **Tick processor tests**: Feed recorded ticks, verify entry/exit decisions
3. **Streamer test**: Connect to Upstox, verify protobuf parsing (requires valid token)
4. **Integration test**: Full daily cycle with mock IEP + mock ticks
5. **Paper trader test**: Verify trade logging
6. **UI test**: API route responds, live status updates

## What Remains (from Phase 3.5 Plan)

1. **`volume-profile.ts`** — fetches VAH from Python `/api/volume-profile`
2. **Python pipeline endpoints** — IEP batch fetch, instrument key mapping, LTP, volume, VAH
3. **Next.js WebSocket endpoint** — real-time push from server to browser
4. **Live trading logs** — terminal output in Live Trading tab (like old system's resizable terminal)
5. **Tests** — 6 categories listed above
6. **Upstox token flow end-to-end** — token validation → list validation → start trading

## How to Run

```powershell
cd MA_Stock_Trader_NA
bun run dev
```

- Frontend: http://localhost:3000
- Live Trading page: http://localhost:3000/live-trading
- Python server: http://localhost:8001

The live trader (orchestrator + streamer) runs inside the Next.js server process when you click "Start Trading". It connects to Upstox WebSocket using the token saved in `settings.db`.

## Risks

1. **Upstox token required**: WebSocket connects fail with 401 without a valid token. Token must be entered via Token Session tab first.
2. **Protobuf schema mismatch**: If Upstox updates their `.proto`, parsing breaks. We pin the schema file at `frontend/proto/MarketDataFeed.proto`.
3. **Market hours**: Bot only runs 9:15-15:30 IST. No scheduler implemented yet.
4. **Reconnection**: State survives WebSocket disconnection. Current ticks during downtime are lost (same as old Python).
5. **Singleton orchestrator**: Current API route keeps one instance in memory. Server restart loses state. Needs persistence for production.
