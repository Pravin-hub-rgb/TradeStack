# Reversal Live Trading Flow — Theory

## What Is This Bot?

This bot trades mean-reversion setups. The idea: a stock has been falling for 3 or more consecutive days. After such a decline, it's stretched — like a rubber band. At some point, it will snap back. The bot catches that snap-back.

There are two ways the stock can reverse:

**OOPS (Gap-Down Reversal).** The stock opens lower than yesterday's close (gap down). This looks bad at first, but then something interesting happens — the selling dries up, buyers step in, and the price climbs back above yesterday's close. The "oops" moment is when the early weakness turns out to be a fakeout. We enter when price crosses back above yesterday's close.

**Strong Start / SS (Gap-Up Strength).** The stock opens higher than yesterday's close (gap up). This is the stock showing early strength right from the bell. Buyers are in control from minute one. We enter when price breaks above the highest level it reached in the first few minutes.

Max 2 positions per day. Stocks with 7 or more consecutive down days get VIP priority. OOPS stocks are always preferred over SS stocks.

---

## What Filters Does a Stock Need to Pass?

Before the bot even starts watching a stock live, the stock must pass several checks. These happen before the market opens.

### Terms You Need to Know

**IEP (Indicative Equilibrium Price)** — This is just the stock's opening price. We don't calculate it. NSE figures it out during the pre-market call auction between 9:00 and 9:15 AM, and we simply read it from Upstox.

Here's how the pre-market session works. Between 9:00 and 9:08, everyone puts in their buy and sell orders. Between 9:08 and 9:12, the exchange matches them up to find the single price where the maximum number of shares can trade. That becomes the opening price — the IEP. By 9:12, it's finalized.

At about 9:14-9:15, we ask Upstox "what's the last_price for this stock?" During pre-market, their last_price field is the IEP. That's it — one API call, one read. No calculation on our end.

What we do with it is compare it to yesterday's close. Gap up or gap down tells us whether this is a Strong Start or OOPS setup.

**Decline Days** — How many consecutive days the stock has closed lower. The scanner (`ReversalScanner`) iterates periods 3–15 for each stock, finds the window with the highest decline percentage, and stores the period length in the `period` field of the scanner result.

When a stock is added to the reversal trading list, this `period` value is saved to the SQLite `stock_list_items` table under the `period` column. When the live trader loads stocks from the list (`GET /api/stock-list/reversal`), it maps `period` to `declineDays` on the stock object.

The threshold:
- **7+ decline days** = OOPS VIP — highest priority, most oversold, most likely to snap back hard
- **3–6 decline days** = normal priority

**Situation / Trend Context** — The scanner determines the stock's pre-decline trend direction by comparing where the 20-day moving average stood at two points in time:
- **Point A:** The first day of the decline window (e.g., if the stock declined for 5 days, Point A is 5 trading days ago)
- **Point B:** 5 trading days before Point A

If the 20-MA was higher at Point A than Point B, the MA was rising → the stock was in an uptrend before the decline. If it was lower, the MA was falling → downtrend.

The 50-calendar-day lookback simply ensures there are enough data points to calculate a clean 20-period MA at Point B. It's not compared to anything — it's just the data window.

This is stored in SQLite as `trend_context`:

| Scanner Output | SQLite Field | Mapped To | Meaning |
|---|---|---|---|
| `trend_context: "uptrend"` | `trend_context` | `situation: "reversal_s1"` | Stock was rising before the decline. Expect gap UP (SS candidate). |
| `trend_context: "downtrend"` | `trend_context` | `situation: "reversal_s2"` | Stock was already falling before the decline. Expect gap DOWN (OOPS candidate). |

The mapping happens in `LiveTrading.tsx` when loading stocks into the live trader:
```js
situation: s.trend_context === "uptrend" ? "reversal_s1" : "reversal_s2"
```

---

### Setup Types

| Setup | Gap Direction | Entry Condition | Low Violation Check | VIP Rule |
|-------|--------------|-----------------|--------------------|----------|
| **OOPS** (reversal_s2) | Gap DOWN (any size below –0.3%) | Price crosses above yesterday's close | NOT rejected (dip is expected) | If 7+ decline days → priority 1, rejects all SS |
| **Strong Start / SS** (reversal_s1) | Gap UP (0.3% to 5%) | Price breaks above monitoring window high | REJECTED if low drops >1% below open | 7+ decline days → priority 3 (behind OOPS) |

### Check 1: The Gap Must Be Meaningful (For All Stocks)

Every stock must open with a clear gap — either up or down — that's bigger than 0.3% from yesterday's close. A gap smaller than this is considered flat.

**Why 0.3% minimum?** A flat open means there's no directional signal. For a reversal, we need something to reverse *from*. If the stock opens flat, there's no stretch — no rubber band to snap.

Beyond the flat check, the gap direction must match the expected setup — but the live gap direction **overrides** the pre-classification. A stock classified as OOPS (`reversal_s2`) that gaps up becomes an SS stock on the fly.

#### For OOPS (Gap Down):
- The stock must open lower than yesterday's close (gap ≤ –0.3%)
- There is **no lower limit** on gap size. A 10% gap down is fine — bigger gaps often mean better reversals because the rubber band is stretched tighter.
- If a stock classified as `reversal_s2` gaps up instead, its situation is updated to `reversal_s1` (SS) and the SS gap-up rules apply (0.3%–5% max).

#### For Strong Start (Gap Up):
- The stock must open higher than yesterday's close by at least 0.3%, but **not more than 5%**.
- **Why 5% max?** A gap up larger than 5% is overextended — the reversal may have already happened in the gap itself, leaving no room for further upside. The stock is likely to fade rather than continue.

### Check 2 (SS Only): Open ≈ Low Must Hold (Low Violation)

For Strong Start stocks, the stock must show **"open ≈ low"** — it opens at or very near its low price (within configurable tolerance, default 1%). This tells us buyers were there from the first tick. The stock established its low immediately and started climbing.

If during the monitoring window (market open to entry time) the stock's low drops more than the tolerance below the opening price, the condition is violated and the stock gets rejected. The strength didn't hold — sellers arrived and pushed price below where it opened.

**Why OOPS doesn't need this check.** OOPS stocks already gap down — they're expected to dip. The open ≈ low check is designed for gap-up stocks to make sure they're truly strong. A gap-up stock that immediately sells off and drops 1% below open is showing weakness at the very start. That's not a strong start — that's a fakeout in the opposite direction.

---

## The Flow, Step by Step

### Before the Market Opens

The bot loads stocks from the reversal trading list (`GET /api/stock-list/reversal`). Each stock comes with:
- `symbol` — ticker
- `close` — yesterday's closing price (used as `previousClose`)
- `trend_context` — `"uptrend"` or `"downtrend"` (mapped to `situation: "reversal_s1"` or `"reversal_s2"`)
- `period` — decline day count (mapped to `declineDays`)

No special pre-calculations are needed for reversal (unlike continuation which needs VAH and volume baselines). We just need the previous close, decline days, and trend context.

### Prep Time (~9:14-9:15)

Right before market open, we fetch the IEP — the opening price — for every stock on our list.

For each stock, we check:
- **Does it have an IEP?** If not, we can't trade it — skip.
- **Is the gap meaningful?** Greater than 0.3% in either direction.
- **Does the gap match the expected setup?**
  - If a `reversal_s2` stock (expected OOPS) gaps UP instead, its situation is updated to `reversal_s1` (SS). The gap direction overrides the pre-classification.
  - If it gaps up more than 5%, reject.
  - If it gaps up between 0.3% and 5%, it's treated as SS.
  - If it gaps down, it's treated as OOPS.

Stocks that pass these checks are subscribed via WebSocket. The rest are rejected and never watched.

### Market Opens — OOPS Ready, SS Preparation (9:15 AM)

We subscribe to the passing stocks. The WebSocket starts feeding live prices.

**OOPS stocks are ready immediately.** From the moment the market opens, OOPS stocks can trigger. Their entry condition is simple: wait for price to cross back above yesterday's close. If the stock was down 4% at the open but starts climbing and crosses yesterday's close at 9:17 AM, we enter at 9:17 AM. No waiting for any specific time.

**Strong Start stocks need preparation.** At market open, we check low violations on all SS stocks. Those that pass get their entry levels set:
- **Entry level** = the stock's current daily high
- **Stop loss** = a configurable percentage below the entry level (default 4%)
- This entry level continuously updates — if the stock makes a new high, the entry level moves up with it

Once entry levels are set, SS stocks can also trigger immediately if price crosses above the entry level.

### Entry Time — Selection (configurable, default 9:20)

At 9:20 (about 5 minutes after market open), we do a final check on all remaining stocks, then select which stocks to actually trade.

**The checks:**
1. **Low violation (SS only)** — Did any SS stock drop more than the tolerance (default 1%) below its opening price at any point during the monitoring window? If yes, reject it.

**The selection — VIP priority:**
1. Sort all qualified stocks by priority:
   - **Priority 1** — OOPS stocks with 7+ decline days (VIP) — best
   - **Priority 2** — OOPS stocks with 3–6 decline days — good
   - **Priority 3** — Strong Start stocks with 7+ decline days — okay
   - **Priority 4** — Strong Start stocks with 3–6 decline days — least preferred
2. **If ANY Priority 1 stock exists** (a VIP OOPS candidate), ALL Strong Start stocks are rejected immediately. No exceptions. The slots are reserved for OOPS candidates.
3. From what remains, pick the top 2 stocks.

**Why this priority?** Stocks with 7+ days of decline are the most oversold, the most stretched, the most likely to snap back hard. OOPS (gap down) is the purest mean-reversion setup — the stock is already down at the open, so the reversal has more room to run. Strong Start stocks are secondary because the gap up has already consumed some of the reversal potential.

Stocks that are not selected are unsubscribed. We stop watching them for the day.

### After Entry Time — Watching for Entry Signal

After selection, the chosen stocks continue to be monitored for their entry triggers:

**OOPS:** Price must cross above yesterday's close. This can happen at any time — 9:20, 10 AM, 11 AM, 2 PM.

**SS:** Price must cross above the entry level (the highest high reached since market open, continuously ratcheted up). If the stock is still making new highs, the setup is working. If it's pulled back, it needs to climb back up to those levels.

In practice, for SS, the stock enters on the first tick where price is at or above its highest level so far. If the stock made a strong run during the monitoring window and is still holding that level at entry time, it enters immediately.

### Stop Loss

Once in a position, the stop loss is fixed at a configurable percentage below the entry reference (default 4%):
- **For OOPS:** The entry reference is the price at which we entered. SL = entry price × 0.96.
- **For SS:** The entry reference is the entry level that was being tracked (the daily high from the window, which is what triggered the entry). SL = that level × 0.96.

**No trailing stop loss.** The SL never moves up as the stock rallies. It stays where it was set at entry time.

### When Both Positions Are Filled

As soon as 2 positions are filled, all remaining subscribed stocks (those still waiting for their entry trigger) are immediately unsubscribed. We stop watching them for the day.

### End of Day

All remaining subscriptions are cleaned up. The session's trades are logged.

---

## Key Points to Remember

- **OOPS can trigger anytime.** From market open to close. No waiting period. The only condition is price > yesterday's close.
- **SS can trigger before 9:20.** Once entry levels are set at market open, SS can trigger immediately if price breaks above the entry level.
- **OOPS does not reject on low violation.** Only SS gets rejected for dropping too far below open. OOPS stocks are expected to dip and the low is just noted.
- **VIP priority is strict.** If a 7+ day OOPS stock exists, all SS stocks are thrown out regardless of how many slots remain.
- **2 positions max.** Once both slots are filled, all other stocks are unsubscribed for the day.
- **No trailing SL.** 4% stop loss is fixed from entry.
- **Entry level ratchets up for SS.** The entry level is the highest high of the session, continuously updated. The stock must break its own high to trigger entry.
- **Gap direction overrides pre-classification.** A stock classified as `reversal_s2` (OOPS) that actually gaps up becomes a Strong Start stock. The live gap decides, not the scanner label.
- **Decline days come from the scanner's `period` field**, saved in SQLite and mapped to `declineDays` in the live trader. No text files, no `-u`/`-d` flags.
