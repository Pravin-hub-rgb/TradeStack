# Unsubscription Bug Fix — Tick-Rejected Stocks Never Unsubscribed from WebSocket

## Bug Description

When the tick processor detects a low violation (or any other rejection trigger) mid-session, it calls `stock.reject()` which sets `isSubscribed = false`. This prevents local processing of further ticks, but **the stock is never actually removed from the Upstox WebSocket subscription**.

Upstox continues sending ticks for these rejected stocks, wasting bandwidth, increasing memory, and potentially hitting subscription limits.

## Root Cause

The same bug exists in both the new Node.js codebase and the old Python codebase.

### Node.js — `state-machine.ts`

```ts
reject(reason: string): void {
  this.isActive = false;
  this.isSubscribed = false;  // ← Flag set, but no WebSocket call
  this.rejectionReason = reason;
  this.transitionTo(StockStateEnum.REJECTED, reason);
}
```

### Node.js — `subscription-mgr.ts` (both reversal and continuation)

```ts
unsubscribeLowViolated(): void {
  this.monitor.checkViolations();
  const rejected: string[] = [];
  for (const [key, stock] of this.monitor.stocks) {
    if (stock.isSubscribed && stock.state === StockStateEnum.REJECTED) {
      //              ^^^^^^^^^^^^^^
      //    BUG: reject() already set isSubscribed = false,
      //    so this condition is ALWAYS false for tick-rejected stocks
      rejected.push(key);
    }
  }
  // safeUnsubscribe is never called for tick-rejected stocks
}
```

### Old Python — same pattern

```python
# state_machine.py
def reject(self, reason: str):
    self.is_active = False
    self.is_subscribed = False  # Flag only, no WebSocket call
    self._transition_to(StockState.REJECTED, reason)

# subscription_manager.py
def get_rejected_stocks(self) -> List[str]:
    rejected_keys = []
    for instrument_key, stock in self.monitor.stocks.items():
        if stock.state == StockState.REJECTED and stock.is_subscribed:
            #                                          ^^^^^^^^^^^^^^
            # Same bug — always false for tick-rejected stocks
            rejected_keys.append(instrument_key)
    return rejected_keys
```

## The Bug Chain

```
TICK arrives → low violation detected
  → tick_processor calls stock.reject()
    → isSubscribed = false
    → state = REJECTED
    → (no call to streamer.unsubscribe())
    
Next tick arrives (still from WebSocket)
  → integration checks stock.isSubscribed → false → early return
  → tick ignored locally, but Upstox still sending it

At ENTRY_TIME → unsubscribeLowViolated()
  → filters by stock.isSubscribed && state === REJECTED
  → tick-rejected stock has isSubscribed = false → NOT collected
  → safeUnsubscribe() NOT called for this stock
  → WebSocket subscription remains active forever
```

## Fix Applied

**Minimal fix:** Remove the `isSubscribed` check from `unsubscribeLowViolated()`. Collect all REJECTED stocks regardless of their subscription flag.

### Changed Files

**`frontend/src/lib/live-trader/reversal/subscription-mgr.ts`** and **`frontend/src/lib/live-trader/continuation/subscription-mgr.ts`**

```ts
// BEFORE (buggy):
const rejected: string[] = [];
for (const [key, stock] of this.monitor.stocks) {
  if (stock.isSubscribed && stock.state === StockStateEnum.REJECTED) {
    rejected.push(key);
  }
}

// AFTER (fixed):
const rejected: string[] = [];
for (const [key, stock] of this.monitor.stocks) {
  if (stock.state === StockStateEnum.REJECTED) {
    rejected.push(key);
  }
}
```

### Why This Works

1. Tick processor calls `stock.reject()` → `state = REJECTED`, `isSubscribed = false`
2. At ENTRY_TIME, `unsubscribeLowViolated()` collects all REJECTED stocks
3. Calls `safeUnsubscribe(rejected)` → calls `streamer.unsubscribe(keys)` on Upstox SDK
4. Calls `markStocksUnsubscribed()` → sets `state = UNSUBSCRIBED`

### What `safeUnsubscribe` Does

```ts
// In streamer.ts
unsubscribe(keys: string[]): void {
  for (const key of keys) this.activeInstruments.delete(key);
  if (this.sdkStreamer && this.connected) {
    this.sdkStreamer.unsubscribe(keys);  // Actual Upstox SDK call
    this.log(`Unsubscribed from ${keys.length} instruments`);
  }
}
```

## All Affected Files

| File | What Changed |
|------|-------------|
| `frontend/src/lib/live-trader/reversal/subscription-mgr.ts:38` | Removed `stock.isSubscribed &&` from filter |
| `frontend/src/lib/live-trader/continuation/subscription-mgr.ts:38` | Removed `stock.isSubscribed &&` from filter |

## Scope

Only stocks rejected by the tick processor during the monitoring window (low violation for SS, gap failure for pre-market) were affected. Stocks unsubscribed via:
- VIP priority rejection (OOPS rejects SS): **works correctly** — keys passed directly from `selectStocks()` → `safeUnsubscribe()`
- Positions filled (remaining un-entered): **works correctly** — iterates subscribed stocks and unsubscribes
- End-of-day cleanup: **works correctly** — same pattern
- Pre-market gap validation: **works correctly** — stocks rejected before subscription even starts

## Future Optimization

For immediate unsubscription (rather than waiting for ENTRY_TIME), add a `streamer` callback to the state machine:

```ts
// In state-machine.ts
type UnsubscribeFn = (instrumentKey: string) => void;

export class StateMachineMixin {
  public onUnsubscribe: UnsubscribeFn | null = null;

  reject(reason: string): void {
    this.isActive = false;
    this.isSubscribed = false;
    this.rejectionReason = reason;
    this.transitionTo(StockStateEnum.REJECTED, reason);

    // Immediate WebSocket unsubscription
    if (this.onUnsubscribe && this.instrumentKey) {
      this.onUnsubscribe(this.instrumentKey);
    }
  }
}
```

Set the callback from integration:

```ts
for (const stock of monitor.stocks.values()) {
  stock.onUnsubscribe = (key) => streamer.unsubscribe([key]);
}
```

This was not implemented in the current fix to keep changes minimal.
