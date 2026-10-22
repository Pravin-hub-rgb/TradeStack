# Step 22 — Real-Order Execution (the OFF side of the paper_trading switch)

**Date:** 22 Oct 2026
**Phase:** Post-SOLIDIFY feature — fills the gap where `paper_trading=false` previously did nothing.

## What We Built

Until now, flipping the `paper_trading` setting to `false` silently disabled the PaperTrader
and the bot did… nothing. There was no real-order path. This step at the same seam:

```
before:  bot decision → PaperTrader.logEntry()      → SQLite trade log
after:   bot decision → TradeExecutor.logEntry()    → paper or real, decided by setting
         bot decision → TradeExecutor.logExit()     → trade log only (exits stay manual)
```

### Files

| File | Change |
|------|--------|
| `frontend/src/lib/live-trader/order-executor.ts` | NEW — `TradeExecutor` seam, `PaperExecutor`, `UpstoxExecutor`, `createTradeExecutor()` |
| `frontend/src/lib/live-trader/types.ts` | exported `OrderProduct` type; added `orderProduct` to `LiveTraderConfig` |
| `frontend/src/lib/live-trader/index.ts` | builds executor next to the (conditional) PaperTrader; hands it to integrations |
| `frontend/src/lib/live-trader/{reversal,continuation}/integration.ts` | `paperTrader:` params renamed to `tradeExecutor:`; both `logEntry`/`logExit` call sites switched |
| `frontend/src/lib/live-trader/stocks-loader.ts` | passes executor instead of PaperTrader |
| `frontend/src/app/api/live/route.ts` | maps `order_product` setting (validated I/D/MTF, default I) |
| `backend/src/settings.py` | seeds `order_product` = I in `live_trading` category |
| `frontend/src/components/LiveTrading.tsx` | real-mode gate: start → `doStart` checks `paper_trading` → red confirm dialog → `startBot` |
| `frontend/vitest.config.ts` | added `@` → `src` alias (executor imports `@/lib/api`) |
| `frontend/tests/lib/order-executor.test.ts` | NEW — 7 tests, mocked fetch, no network |

### UpstoxExecutor flow (fire-and-track, per user requirement)

1. **Guard** — no token or instrument key → abort.
2. **MARKET BUY** at `price: 0`, tag `TS-ENTRY`, product/quantity from settings.
3. **Poll fill** — `GET /order/details` every 500 ms, 8 attempts (~4 s). `rejected` or
   still-not-filled → **STOP, no SL**, ERROR on terminal, manage manually.
4. **SL-M SELL** at `stock.entrySl` trigger, tag `TS-SL`. One acceptance check only —
   a stop sits `open`/`trigger pending` for hours, polling it is meaningless.
   Rejected SL → ERROR, manage manually. Filled immediately → gap through trigger note.
5. **Trade log** — POST `/api/trades/log-entry` with broker `average_price` (session id
   prefixed `real_` so paper and real rows are distinguishable).
6. **Exit** — state machine still decides exits; executor only updates the trade-log row
   (`GET /api/trades/list` → `PUT /api/trades/<id>`). **It never places an exit order.**

### Bugs the tests caught during this step

- `time` was referenced but never passed into `executeEntry` (ReferenceError on real path).
- `entry_date` is **required** by `TradeLogEntry` (server.py:918) — shared executor body
  added it (same contract as PaperTrader).
- A rejected SL previously could log "will trigger on exchange" — branch fixed.
- Polling the SL order forever "unknown" — replaced with single acceptance check.

## Verification

```powershell
# frontend (workdir frontend)
bun run vitest run        # 44/44 (37 existing + 7 executor)
bunx tsc --noEmit         # clean
bun run lint              # 45 problems — below the 46 baseline
bun run build             # compiles

# backend (repo root)
.\backend\venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider   # 123 passed

# seed lands on an existing DB via ensure_settings() at startup:
SELECT * FROM settings WHERE key = 'order_product';   # → ('order_product', 'I', 'live_trading')
```

## Safety notes

- Default stays `paper_trading = true` — real orders only when the setting is off AND the
  red dialog is confirmed.
- Real trades are tagged `TS-ENTRY` / `TS-SL` for easy identification in Upstox.
- India regulatory note (SEBI algo rules): automated retail trading may require static IP /
  broker algo registration before real use — placeholder reminder, not legal advice.

## 🎓 Learning From This Step

| Concept | What It Is | Suggested Learning Project | Focus Area |
|---------|-----------|---------------------------|------------|
| Strategy/Seam pattern | One interface, two implementations chosen by config (test double vs real adapter) | `mini-id-generator`: `IdGenerator` interface with `UuidGen` / `FakeGen` toggled by env var | Constructor injection; make tests pick the fake |
| Broker REST order API | Place/poll pattern: async order lifecycle (accepted → open → complete/rejected) | Mini order sandbox that fakes delayed fills | Status machines; poll-then-give-up semantics |
| Fire-and-forget with tracking | `void fn()` keeps the tick loop responsive; state bookkeeping (`entered` Set) prevents double fire | Click-spam-proof button: ignore repeats while a request is in flight | Re-entrancy guards |
| Fake timers in tests | `vi.useFakeTimers()` + `runAllTimersAsync()` to test polling loops deterministically | Simulate a 3-retry downloader without sleeping | Why "flush microtasks after last timer" matters |
