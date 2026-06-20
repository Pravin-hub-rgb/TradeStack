# Step 17: Reversal Theory Doc Restructure + Unsubscription Bug Fix

**Date:** 13 June 2026

## What We Built / Fixed

### 1. Restructured `docs/REVERSAL_LIVE_TRADING_FLOW.md`

The reversal theory doc was restructured to mirror the continuation theory doc (`CONTINUATION_LIVE_TRADING_FLOW.md`) structure.

#### Structural Changes

| Continuation Doc Has | Reversal Doc Now Has |
|---------------------|---------------------|
| SVRO checklist table | Setup Types table (OOPS vs SS side-by-side) |
| Check 1: Gap Up (Configurable Range) | Check 1: The Gap Must Be Meaningful |
| Check 2: Open ≥ VAH | (skipped — no VAH for reversal) |
| Check 3: Open ≈ Low Must Hold | Check 2 (SS Only): Open ≈ Low Must Hold |
| Check 4: Volume Threshold | (skipped — no volume check for reversal) |
| Flow sections with consistent timeline | Same timeline phrasing: Prep Time → Market Opens → Entry Time → After Entry → Stop Loss → Both Filled → End of Day |

#### Content Changes

**Removed text-file references:** The old doc referenced `SBIN-7` filename conventions and `-u`/`-d` flags from the old Python codebase. Replaced with SQLite data model:

| Old (text files) | New (SQLite) |
|---|---|
| Filename `SBIN-7-u.txt` → decline 7, uptrend | Scanner returns `{ period: 7, trend_context: "uptrend" }` → mapped to `{ declineDays: 7, situation: "reversal_s1" }` |
| Filename `SBIN-7-d.txt` → decline 7, downtrend | Scanner returns `{ period: 7, trend_context: "downtrend" }` → mapped to `{ declineDays: 7, situation: "reversal_s2" }` |

**Fixed Trend Context explanation:** The old doc incorrectly said "5-period MA compared to 5 periods earlier". Corrected to:

> The scanner compares the **20-day MA** at two points:
> - **Point A**: The first day of the decline window
> - **Point B**: 5 trading days before Point A
>
> If the 20-MA was higher at A than B → MA was rising → uptrend (`reversal_s1`).  
> If lower → MA was falling → downtrend (`reversal_s2`).
>
> The 50-calendar-day lookback is just the data window to ensure clean MA calculation at Point B.

**Added "Situation / Trend Context" term section** explaining the `trend_context → situation` mapping that happens in `LiveTrading.tsx:104`.

### 2. Bug Fix: Stock `reject()` → `isSubscribed = false` but never called `streamer.unsubscribe()`

#### Bug

Same bug existed in old Python and new Node.js codebases. When the tick processor detected a low violation:

1. Called `stock.reject()` → set `isSubscribed = false`, `state = REJECTED`
2. **No call to `streamer.unsubscribe()`** — Upstox kept sending ticks
3. `unsubscribeLowViolated()` filtered by `stock.isSubscribed && state === REJECTED`
4. Since `reject()` already set `isSubscribed = false`, condition was **always false**
5. `safeUnsubscribe()` was never called → WebSocket subscription remained forever

#### Fix

**`frontend/src/lib/live-trader/reversal/subscription-mgr.ts:38`** and **`continuation/subscription-mgr.ts:38`**:

```ts
// BEFORE (buggy):
if (stock.isSubscribed && stock.state === StockStateEnum.REJECTED)

// AFTER (fixed):
if (stock.state === StockStateEnum.REJECTED)
```

Now tick-rejected stocks are collected and passed to `safeUnsubscribe()` → `streamer.unsubscribe()` at entry time.

### 3. Data Fidelity Fix: `declineDays` Not Passed to Live Trader

**`frontend/src/components/LiveTrading.tsx:104`**:

The `period` field from the stock list API was not being passed to the live trader. Every reversal stock got `declineDays = 0`, so VIP priority never activated.

```ts
// BEFORE:
const stocks = rawStocks.map((s: any) => ({
  ...,
  situation: s.trend_context === "uptrend" ? "reversal_s1" : "reversal_s2"
  // ← missing declineDays!
}));

// AFTER:
const stocks = rawStocks.map((s: any) => ({
  ...,
  declineDays: s.period ?? 0,
  situation: s.trend_context === "uptrend" ? "reversal_s1" : "reversal_s2"
}));
```

### 4. Created `docs/unsubscription_bug_fix.md`

Standalone doc with full bug analysis, root cause, code snippets (Node.js + old Python), fix diff, and verification that all other unsubscription paths work correctly.

## Files Changed

| File | Change |
|------|--------|
| `docs/REVERSAL_LIVE_TRADING_FLOW.md` | Full restructure + SQLite data model + fixed trend context explanation |
| `docs/unsubscription_bug_fix.md` | New — standalone bug analysis doc |
| `frontend/src/components/LiveTrading.tsx:104` | Added `declineDays: s.period ?? 0` |
| `frontend/src/lib/live-trader/reversal/subscription-mgr.ts:38` | Removed `isSubscribed` filter |
| `frontend/src/lib/live-trader/continuation/subscription-mgr.ts:38` | Removed `isSubscribed` filter |

## Verification

```powershell
cd MA_Stock_Trader_NA\frontend
npx tsc --noEmit   # Zero errors
```

## 🎓 Learning From This Step

| Concept | What It Is | Suggested Learning Project | Focus Area |
|---------|-----------|---------------------------|------------|
| **Doc-driven development** | Writing a theory doc first, then aligning code to match | Write a spec doc for any existing feature, then audit the code against it | Finding discrepancies between docs and implementation |
| **SQLite vs filesystem data** | Moving from text file conventions to structured database fields | Migrate any flat-file config to SQLite and update all references | Schema design, migration patterns |
| **WebSocket subscription management** | Tracking which instruments are actively subscribed and cleaning up rejected ones | Build a WebSocket client that subscribes/unsubscribes based on a priority queue | Resource cleanup, bandwidth optimization |
| **Bulk vs immediate unsubscribe** | Deferred cleaning (at phase boundaries) vs immediate cleanup (on reject) | Build a system that tracks open subscriptions and has both lazy and eager cleanup modes | Tradeoffs: latency vs throughput vs bandwidth |
| **20-period MA trend context** | Determining pre-decline trend by comparing MA at two points in time | Build a function that classifies a stock's trend direction from price history | Window sizing, NaN handling, date alignment |
