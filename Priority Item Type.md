Priority Item Type
🔴 P0 (done) WebSocket 403 — Upstox basic plan blocks feed. REST polling fallback needed or Plus upgrade. Also token is revoked. Blocking
🔴 P1 (done) Bhavcopy update doesn't work for date gaps (stuck at June 8) Bug
🟡 P2 Scan progress state lost on tab switch Bug
🟡 P2 Bottom notification toasts for stock additions Feature
🟡 P2 Enhanced live trading table (rejected/active sections, live LTP, P&L) Feature
📄 Update step16 doc with continuation findings, volume fix, trailing SL removal Docs

FINAL SUMMARY — 7 Issues (all fixed (not tested))
🔴 Issue 1: Strong Start SL uses dailyHigh instead of entry price
Where: reversal/state-machine.ts:183-185 inside enterPosition()
if (this.situation === "reversal_s1") {
this.entryHigh = this.dailyHigh;
this.entrySl = this.entryHigh _ (1 - entrySlPct); // dailyHigh _ 0.96
}
Old behavior (run_reversal_original.py:316): stock.entry_sl = price \* 0.96
Bug: SL is based on dailyHigh (which can be above the entry tick price), not the actual entry price. Overwrites the SL that was already correctly set by trackEntryLevels().
Fix: Remove the s1 overwrite block in enterPosition() — SL is already set before entry by trackEntryLevels().
🔴 Issue 2: State machine skips ENTERED state
Where: reversal/state-machine.ts:9, 177-181

- VALID_TRANSITIONS[MONITORING_ENTRY] = [ENTERED, REJECTED] — MONITORING_EXIT NOT allowed
- enterPosition() calls transitionTo(MONITORING_EXIT) — skips ENTERED
- transitionTo() never calls canTransitionTo(), so no runtime error, but contract is violated
  Fix: Either (a) change enterPosition() → ENTERED + make exit monitoring also check ENTERED, or (b) add MONITORING_EXIT to valid transitions from MONITORING_ENTRY
  🟡 Issue 3: trackEntryLevels() never sets entryReady
  Where: continuation/tick-processor.ts:30-40
  Bug: Updates entryHigh/entrySl but never sets entryReady = true. Old Python modular code sets entry_ready = True when current_time >= ENTRY_TIME. Stocks that become qualified AFTER prepareEntries() runs (e.g., late volume validation) never get entryReady set and can never enter.
  Fix: Add time-gated if (nowMinutes >= entryMinutes) this.stock.entryReady = true to trackEntryLevels()
  🟡 Issue 4: Missing isActive guard in handleEntryMonitoring()
  Where: continuation/tick-processor.ts:42-51
  Bug: No if (!this.stock.isActive) return; check. Low practical impact (reject() transitions state to REJECTED, which processTick() filters). Defense-in-depth.
  Fix: Add guard at top of handleEntryMonitoring()
  🟡 Issue 5: Phase 2 unsubscription broken — rejected stocks never unsubscribed
  Where: continuation/subscription-mgr.ts:36-43 and continuation/state-machine.ts:76-80
  Bug: reject() sets isSubscribed = false (line 78), then getRejectedStocks() requires stock.isSubscribed === true (line 39) — returns empty every time. Stocks are never actively unsubscribed from WebSocket.
  Fix (two options):

1. Remove isSubscribed check from getRejectedStocks() / getUnselectedStocks()
2. Don't set isSubscribed = false in reject() — let subscription manager handle it
   🟡 Issue 6: Max positions hardcoded to 2
   Where: reversal/integration.ts:100 and continuation/integration.ts:103
   if (this.enteredCount >= 2 && subscribed.length > 2) {
   Bug: Ignorsk config.maxPositions. Integration classes don't receive the config.
   Fix: Add maxPositions parameter to ReversalIntegration and ContinuationIntegration constructors, use it instead of hardcoded 2.
   🟡 Issue 7: prepareEntry entryReady — NOT a bug (misdiagnosed)
   continuation/state-machine.ts:173 does set entryReady = true when entry time is reached. The real issue is #3 (trackEntryLevels not setting entryReady for late-qualifying stocks). Merged into issue 3.

---

new one 12 jun 2026 (fixed)
REMAINING ISSUES — 5 that need fixing
🔴 CRITICAL 1: Phase 2 unsubscription NEVER called
Both OLD bots call phase_2_unsubscribe_after_low_violation() after the violations check at entry time. NEW only calls checkViolations() but never calls unsubscribeLowViolated() for either mode. So stocks that fail low violation or volume checks remain WebSocket-subscribed (wasting bandwidth and CPU).
Fix: Add this.reversalSubscriptionManager?.unsubscribeLowViolated() and this.continuationSubscriptionManager?.unsubscribeLowViolated() after the Phase 2 checks in index.ts:start().

<details>
<summary>OLD code (run_reversal.py:394)</summary>
integration.phase_2_unsubscribe_after_low_violation()
</details>
🔴 CRITICAL 2: Continuation Phase 2 timing — 30s vs 5min after market open
OLD continuation runs Phase 2 30 seconds after market open (time.sleep(30) then violations + volume). NEW runs Phase 2 at ENTRY_TIME (~5 min after market open). This 4.5-minute gap fundamentally changes which stocks pass/fail:
- Low violation: 4.5 more minutes of price dropping → more stocks rejected
- Volume: 4.5 more minutes of volume accumulation → more stocks pass SVRO ratio
Fix: Move continuation's Phase 2 to MARKET_OPEN + 30s (before ENTRY_TIME wait), matching OLD.
🔴 CRITICAL 3: IEP failure — OHLC fallback vs skip
OLD continuation falls back to OHLC-based gap validation when IEP is unavailable. NEW skips the stock entirely. If the IEP API fails or returns data for only a subset of stocks, NEW silently drops the rest.
Fix: Add OHLC fallback in the pre-market flow when IEP is missing.
<details>
<summary>OLD code (run_continuation.py:262-298)</summary>
if not iep:
    print(f"{symbol}: IEP not available, using OHLC data")
    # Fallback: fetch OHLC data for gap validation
    ohlc_data = upstox_fetcher.get_historical_data(...)
    stock.set_open_from_ohlc(ohlc_data)
</details>
🟡 MEDIUM 4: Volume baseline rejection at pre-market
OLD stores volume baseline at pre-market but defers rejection to Phase 2 (giving stocks a chance if baseline loads later). NEW rejects immediately at pre-market if baseline is 0 or 1000000 — stocks never get subscribed, can never trade, even if baseline data becomes available later.
Fix: Don't reject at pre-market; store baseline value, create validatedKey, let Phase 2 handle rejection like OLD does.
🟡 MEDIUM 5: OHLC candle time filter missing
OLD continuation filters OHLC candles to a specific time window (MARKET_OPEN + 1 minute within 60s). NEW processes ALL I1-interval candles regardless of time. This could mean the stock's daily high is inflated by pre-open or post-open data.
Fix: Add a time-based filter to OHLC processing in continuation/stock-monitor.ts:processOHLC().

---

during waiting phase ... ...
how we update the high and low??
tick wise or?? 1 min ohlc what should we use??
