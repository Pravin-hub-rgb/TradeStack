# Continuation Live Trading Flow — Theory

## What Is This Bot?

This bot trades the continuation pullback pattern. The idea is simple: a stock was in an uptrend (above its 20-day moving average), pulled back down (closed below the 20-day MA), and is now coming back up near the MA with the MA still rising. That creates a triangle-like consolidation — a spring coiled for the next leg up. The bot enters when the stock breaks out above the highest price it reached during the first few minutes of trading.

We take maximum 2 positions per day. No priority system — first come, first serve. Whichever two stocks trigger their entry signal first get filled, and the rest are unsubscribed.

---

## What Filters Does a Stock Need to Pass?

Before the bot even starts watching a stock live, the stock must pass several checks. These happen before the market opens.

### Terms You Need to Know

**IEP (Indicative Equilibrium Price)** — This is just a fancy name for the stock's opening price. We don't calculate it. NSE figures it out during the pre-market call auction between 9:00 and 9:15 AM, and we simply read it from Upstox.

Here's how the pre-market session works. Between 9:00 and 9:08, everyone puts in their buy and sell orders. Between 9:08 and 9:12, the exchange matches them up to find the single price where the maximum number of shares can trade. That becomes the opening price — the IEP. By 9:12, it's finalized.

At about 9:14-9:15, we ask Upstox "what's the last_price for this stock?" During pre-market, their last_price field is the IEP. That's it — one API call, one read. No calculation on our end.

But what we do with it matters. We compare it to yesterday's close to calculate the gap percentage. Is it a gap up? Gap down? Flat? That tells us whether the setup is valid and which entry method to use.

**VAH (Value Area High)** — VAH tells us: "At what price was most of yesterday's volume concentrated at the higher end?" We're looking for the zone where 70% of yesterday's total volume traded. The highest price in that zone is the VAH.

Think of it like this. Yesterday, the stock traded between, say, ₹100 and ₹150. Somewhere in that range, most of the money was changing hands — that's the "value area." It might be between ₹120 and ₹140. In that case, VAH is ₹140. If the stock opens today at ₹142, that's above the VAH — above where most of yesterday's trading happened at the higher end. It tells us the buyers from yesterday are still interested. That's a good sign for continuation.

If the stock opens at ₹115 — below the value area — it means the stock couldn't even hold yesterday's heavy-volume zone. Sellers are in control. We reject it.

**How we get VAH.** We download yesterday's 1-minute candle data from Upstox (every minute: open, high, low, close, volume). Using those 375 or so data points, we figure out where 70% of the volume clustered. The details of the math are straightforward — we're essentially sorting the price range by where volume was heaviest and drawing a box around the heavy zone. The top of that box is VAH, the bottom is VAL (Value Area Low).

**SVRO** — This is Manas Arora's 4-part filter for continuation entries. Each letter is a gate the stock must pass. Think of it as a checklist that runs in order:

| Letter | Check | Timing |
|--------|-------|--------|
| **S** | Strong Start (gap up + open near low) | Pre-market |
| **V** | Value Area (open at or above VAH) | Pre-market |
| **R** | Relative Volume (enough volume by entry time) | At entry time |
| **O** | Opening Range Breakout (break above window high) | After entry time |

**S — Strong Start (Gap Up + Open ≈ Low).** The stock must gap up (configurable range, default 0.3% to 5%). Too small means no directional signal. Too big means it's overextended.

Plus, the stock must show "open ≈ low" — meaning the stock opens at or very near its low price (within a configurable tolerance, default 1%). If a stock opens at ₹100 and the low is also ₹100 (or ₹99.5, within tolerance), it means buyers were there right from the first tick. The stock didn't dip after opening — it established its low immediately and started moving up. This is the hallmark of a strong start.

During the monitoring window (market open to entry time), if the stock's low drops more than the tolerance below the opening price, the condition is violated — sellers have arrived and the strength isn't holding. The stock gets rejected at entry time.

**V — Value Area / VAH (Continuation Only).** The opening price must be at or above yesterday's VAH. This ensures the stock opens inside or above the zone where institutions were buying yesterday.

**R — Relative Volume.** At entry time (configurable, default 9:20), the stock's cumulative volume since market open must be at least a configurable percentage of its 10-day average daily volume (default 7.5%). This means over the monitoring window, the stock needs to have traded enough volume to show genuine interest. If the volume is too low by entry time, the move is probably noise — reject it. Checked once at entry time.

**O — Opening Range Breakout (Entry Trigger).** After entry time, the stock must reach or exceed its entry level — which is initialized to the monitoring window high and then ratchets up with every new daily high. The stock enters on the first tick where price is at a high (new or equal). This confirms the stock is holding its strength.

| Check | Continuation |
|-------|-------------|
| S | Gap UP (configurable min-max, default 0.3-5%) + Open ≈ Low (configurable tolerance, default 1%) |
| V | Open ≥ VAH |
| R | Volume ≥ configurable % of 10-day avg (default 7.5%) at entry time |
| O | Break above monitoring window high |

---

### Check 1: Gap Up (Configurable Range)

The stock must open higher than yesterday's close, but not too much higher. Both limits are configurable in Settings.

- **Why a minimum?** If the gap is smaller than the minimum (default 0.3%), it's considered flat. A flat open means there's no clear directional signal — the stock isn't showing any particular strength or weakness at the bell. We're looking for stocks that gap up because that shows buyers are willing to pay more than yesterday's close. A flat open doesn't give us that conviction, so we pass.

- **Why a maximum?** A gap larger than the maximum (default 5%) is too extreme. When a stock gaps up that much, it's often overextended — the move has already happened in the gap itself. There's a higher chance of profit-taking and reversal. We want a moderate gap that leaves room for the continuation move to unfold during the day.

### Check 2: Opening Price Must Be Above VAH

The stock's opening price must be at or above yesterday's VAH.

- **Why?** VAH represents where the big money was active yesterday in the upper range. If the stock opens below VAH, it means sellers are still in control at the open — the stock failed to sustain yesterday's highs. For a continuation to work, we want the stock to open strong, right in the zone where institutional buyers were active yesterday. Opening below VAH suggests weakness, so we reject.

### Check 3: Open ≈ Low Must Hold (Low Violation)

For gap-up stocks, the stock's low must stay within a configurable tolerance (default 1%) of its opening price during the entire monitoring window (market open to entry time). If at any point the low drops below that tolerance, the stock is rejected at entry time.

- **Why?** A stock that opens gap-up but sells off and drops below tolerance is showing weakness. The buyers who pushed it up at the open are getting trapped — sellers are taking control. For a continuation to work, we need the stock to hold its opening price or trade higher. A deep dip below open suggests the gap-up was a fakeout.

### Check 4: Volume Must Be Above Threshold at Entry Time

At entry time, the stock's cumulative traded volume must reach at least a configurable percentage (default 7.5%) of its 10-day average daily volume.

- **Why?** This is the SVRO volume filter. The idea is that for a breakout to be real, there must be institutional volume behind it in the early minutes. Thin trading means the move might be noise. The threshold checks whether market participants are actively interested in this stock today. Without sufficient volume, the breakout could be a false move that reverses later. Checked once at entry time — if volume is insufficient, the stock is rejected.

---

## The Flow, Step by Step

### Before the Market Opens

The bot already has a list of stocks from yesterday's scanner — these are the stocks showing the zig-zag continuation pattern (went up, pulled back to MA, now retesting near MA with rising MA). The night before or early morning, we calculate two things for each stock:

1. **Volume baseline** — The 10-day average daily volume. This is used later for the SVRO check.
2. **VAH** — Yesterday's Volume-Weighted Average High from the volume profile.

Both are computed from historical data in our cache. No live data needed.

### Prep Time (~9:14-9:15)

Right before market open, we fetch the IEP — the opening price — for every stock on our list. This comes from the exchange's pre-market session which just concluded.

For each stock, we check:
- Does it have an IEP? (If not, we skip it — no opening price means we can't trade it.)
- Is the gap within the configured range? (Compare opening price to yesterday's close.)
- Is the opening price at or above VAH?

Stocks that pass all three checks are carried forward. The rest are rejected and never subscribed to.

### Market Opens — Monitoring Window Begins (9:15 AM)

We subscribe to the passing stocks via WebSocket. From this moment until entry time, we track two things for each stock with every tick:
- The daily high and low
- The cumulative volume

No checks happen yet. We just let data accumulate.

### Entry Time (configurable, default 9:20)

Once entry time arrives, we run two checks:

1. **Low violation** — Did any stock drop more than the tolerance (default 1%) below its opening price at any point during the monitoring window? If yes, reject it.
2. **Volume check** — Does each stock have at least the configured percentage (default 7.5%) of its 10-day average volume? If not, reject it.

Stocks that pass both checks get their entry reference initialized:
- **Entry level** = the highest price the stock reached during the monitoring window
- **Stop loss** = a configurable percentage below the entry level (default 4%)

From this point on, for every new tick, the entry level ratchets up with the daily high — if the stock makes a new high, the entry level and stop loss move up proportionally. This means the stock is always trying to break above its highest level so far. If the stock is still making new highs, the setup is working.

### After Entry Time — Watching for Entry Signal

With every new tick, we check: has the current price reached or exceeded the entry level? Since the entry level tracks the daily high, this effectively means: is this tick a new daily high (or equal to it)?

If yes, we enter the position.

In practice, this means the stock enters on the first tick after entry time where price is at a high. If the stock made a strong run during the monitoring window and is still holding that level at entry time, it enters immediately. If it's pulled back from its high, it needs to climb back up to those levels first.

### After Entry — Stop Loss

Once we're in a position, the stop loss stays fixed at the configured percentage below the entry level. It does NOT move up as price goes higher (no trailing stop). If the stock falls back to the stop loss, the move failed and we exit.

### When Both Positions Are Filled

As soon as we have 2 positions filled, all remaining subscribed stocks (the ones still waiting for their entry trigger) are immediately unsubscribed. We stop watching them for the day.

### End of Day

All remaining subscriptions are cleaned up. The session's trades are logged.

---

## Key Points to Remember

- **Gap up only.** We never trade gap-down stocks in continuation mode.
- **Entry level ratchets with daily high.** It's initialized at the monitoring window high, then moves up with every new high the stock makes. The stock must be at or near a high to trigger entry.
- **No trailing SL.** The stop loss stays fixed permanently. It never moves to breakeven.
- **Volume is checked once at entry time.** Not continuously.
- **Low violation is checked across the entire monitoring window.** If the stock drops below tolerance at any point during the window, it's rejected at entry time.
- **No priority system.** All qualified stocks compete equally. The first 2 to trigger their entry get filled.
