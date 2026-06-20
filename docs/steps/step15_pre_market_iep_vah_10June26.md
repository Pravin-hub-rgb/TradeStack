# Step 15: Pre-market IEP + VAH Endpoints + Orchestrator Pre-market Flow

**Date:** 10 June 2026

## Goal

Build the pre-market data pipeline that the old Python project runs at PREP_START (09:14:30 IST):
1. Fetch IEP (Indicative Equilibrium Price) from Upstox V2 quotes API — determines opening prices
2. Calculate VAH (Value Area High) from previous trading day's 1-min intraday data — determines if stock opened above/below value area
3. Load volume baselines from cache — 10-day mean volume for SVRO validation
4. Wire the orchestrator to run the pre-market sequence before subscribing to the streamer

## Architecture

```
Frontend (Next.js)                        Python (FastAPI)
─────────────────                        ────────────────
LiveTrading.tsx                           server.py
  └─ "Pre-market Prep" button               ├─ POST /api/prep/iep
  └─ POST /api/live {action:"prep"}          ├─ POST /api/prep/volume-profile
       │                                     ├─ POST /api/prep/volume-baselines
       ▼                                     └─ GET  /api/prep/previous-trading-day
api/live/route.ts
  └─ runPreMarketFlow() ──HTTP──→  [Python endpoints]
       │
       ▼
orchestrator/index.ts
  ├─ Fetch volume baselines
  ├─ Fetch VAH (continuation only)
  ├─ Sleep until PREP_START
  ├─ Fetch IEP
  ├─ For each stock: setOpenPrice → validateGap → validateVahRejection
  └─ Store validatedInstrumentKeys → subscribe only these
```

## Files Changed

### New Python Files

| File | Lines | What It Does |
|------|-------|-------------|
| `backend/src/iep_fetcher.py` | 99 | `IEPFetcher` class — batch IEP via `v2/market-quote/quotes`, fallback individual fetch. Uses `get_instrument_key()` from `upstox_fetcher`. |
| `backend/src/volume_profile.py` | 184 | `VolumeProfileCalculator` class — VAH from 1-min OHLCV: price bins at 0.05, distribute volume, POC, expand to 70% value area. Uses V3 historical candle API. |

### Modified Python Files

| File | Change |
|------|--------|
| `backend/server.py` | Added 4 new endpoints + imports for `iep_fetcher` and `volume_profile_calculator` |

### Modified TypeScript Files

| File | Change |
|------|--------|
| `frontend/src/lib/live-trader/index.ts` | Added `runPreMarketFlow()`, `fetchFromPython()`, IST timing helpers (`secondsUntilIST`, `sleepUntilIST`). Modified `start()` to subscribe only validated stocks after pre-market. |
| `frontend/src/lib/live-trader/continuation/state-machine.ts` | Fixed `validateVahRejection()` — no re-transition if already in `GAP_VALIDATED` state. |
| `frontend/src/app/api/live/route.ts` | Added `action: "prep"` handler (background prep, UI polls `preMarketComplete`). |
| `frontend/src/components/LiveTrading.tsx` | Added "Pre-market Prep" button, pre-market status banner, "Start (Validated)" button. |

## New Endpoints

### `POST /api/prep/iep`
```json
// Request:  { "symbols": ["RELIANCE", "TCS", ...] }
// Response: { "prices": { "RELIANCE": 3125.45, "TCS": 3890.20 }, "count": 2, "total_requested": 3 }
```
- Batch calls Upstox `v2/market-quote/quotes?instrument_key=key1,key2,...`
- Extracts `last_price` as IEP (same field used by old project's `get_opening_price`)
- Falls back to individual symbol fetch on batch failure
- Requires valid Upstox bearer token

### `POST /api/prep/volume-profile`
```json
// Request:  { "symbols": ["RELIANCE", "TCS", ...] }
// Response: { "vah": { "RELIANCE": 3150.75, "TCS": 3910.30 }, "count": 2, "total_requested": 3 }
```
- Finds previous trading day by walking back from today, testing "BSE" intraday data availability
- For each symbol: fetches 1-min OHLCV via `v3/historical-candle/{key}/minutes/1/{date}/{date}`
- Volume profile algorithm: price bins at `0.05` → even volume distribution → POC → expand to 70% → VAH/VAL
- Requires valid Upstox bearer token

### `POST /api/prep/volume-baselines`
```json
// Request:  { "symbols": ["RELIANCE", "TCS", ...] }
// Response: { "baselines": { "RELIANCE": 20500933.6, "TCS": 7761678.2 }, "count": 3 }
```
- For each symbol: `cache_manager.load(s)` → tail 10-day mean volume → return
- Returns 1000000 fallback for stocks with < 10 days of cache data
- No token needed (reads local .pkl files)

### `GET /api/prep/previous-trading-day`
```json
// Response: { "date": "2026-06-09" }
```
- Walks back up to 10 days, tests each with "BSE" 1-min intraday data
- Returns first date with data

## Continuation vs Reversal: Different Pre-market Flows

This was a critical design decision — continuation and reversal have **different** pre-market validation requirements:

| Aspect | Continuation | Reversal |
|--------|-------------|----------|
| Volume baselines | ✅ Loaded from cache | ✅ Loaded from cache |
| VAH calculation | ✅ Previous day's volume profile | ❌ Not needed |
| IEP fetch | ✅ At PREP_START | ✅ At PREP_START |
| Gap validation | ✅ 0.3%–5% gap up | ✅ S1: 0.3%–5% up; S2: gap down |
| VAH rejection | ✅ `open >= vah` or rejected | ❌ Not checked |
| MARKET_OPEN | Wait → continue | OOPS (S2) becomes entryReady |
| ENTRY_TIME | Phase 2 → prepare entries | Low violation → SS (S1) prepare |

The orchestrator handles this by checking `stock.situation` (not the global mode), so in "both" mode, continuation stocks get VAH checked while reversal stocks skip it.

## How to Test

```powershell
cd MA_Stock_Trader_NA
bun run dev
```

1. Open http://localhost:3000/live-trading
2. Token Session tab → validate your Upstox token
3. List Validation tab → verify stocks exist
4. Live Trading tab → click "Pre-market Prep" → status shows "Pre-market complete — N stocks validated"
5. Click "Start (Validated)" → subscribes only validated stocks

Or test endpoints directly:
```powershell
curl http://localhost:8001/api/prep/previous-trading-day
curl -X POST http://localhost:8001/api/prep/volume-baselines -H "Content-Type: application/json" -d '{"symbols":["20MICRONS","RELIANCE"]}'
```

## Verification

- [x] `/api/prep/previous-trading-day` returns `2026-06-09`
- [x] `/api/prep/volume-baselines` returns 10-day mean volumes for 20MICRONS, RELIANCE, TCS
- [x] `backend/src/iep_fetcher.py` imports without errors
- [x] `backend/src/volume_profile.py` imports without errors
- [x] Frontend builds without TypeScript errors
- [x] LiveTrading.tsx shows Pre-market Prep button + status banner
- [x] Orchestrator `runPreMarketFlow()` separates continuation vs reversal by `stock.situation`
- [x] VAH transition bug fixed: `validateVahRejection()` no longer double-transitions state

## 🎓 What I Learned

| Concept | What It Is | Suggested Learning Project |
|---------|-----------|--------------------------|
| **Indicative Equilibrium Price** | Pre-market opening price from exchange order matching | Build a CLI tool that fetches pre-market quotes for Nifty 50 stocks |
| **Volume Profile / VAH** | Price-level volume distribution showing where most trading occurred | Plot a volume profile histogram from 1-min OHLCV data |
| **Value Area (70%)** | Price range containing 70% of total volume, centered on POC | Implement value area expansion (bin search algorithm) |
| **IST timezone math** | Converting IST to UTC for server-side timing | Build a market-hours countdown timer |
| **Pre-market orchestration** | Sequential pre-market steps with time-gated execution | Build a trading bot startup sequence with dependency graph |
| **Situation-based filtering** | Different validation rules per stock type in same session | Build a multi-strategy trade router |
