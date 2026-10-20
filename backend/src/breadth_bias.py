"""
Market Breadth Bias Engine — v2 (Best-of-5 Hybrid)

Combines insights from Grok, Claude, ChatGPT, Gemini, and DeepSeek:
- Grok/Claude: Range-position (60-day stochastic), fixed bugs, priority resolution
- ChatGPT: Velocity + acceleration, turn confirmation score
- Gemini: State machine concept (simplified)
- DeepSeek: 3-layer weighted scoring (simplified into turn score)

Key fixes from v1:
1. down_20_5d direction was INVERTED (LOW meant oversold, should be HIGH)
2. EXTREME_OVERSOLD_DAILY was 1200 (never fired, max ever seen was 1103)
3. Divergence window depended on history length (now fixed 6-day)
4. Easy day was auto-set from extreme readings (now participation-only)

Requires: SQLite breadth data via get_all_breadth()
Entry point: compute_daily_bias() — called by server.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
from src.db import get_all_breadth


# ============================================================
# THRESHOLDS (calibrated from 254-day dataset analysis)
# ============================================================

# Absolute hard extremes (rare but powerful — backstop only)
OVERBOUGHT_HARD = 2000
OVERSOLD_HARD = 300

# Absolute soft levels (primary absolute checks)
OVERBOUGHT_20MA = 1500
OVERSOLD_20MA = 500

# Daily capitulation (was 1200 — never fired. Max ever: 1103 on 2026-03-23)
CAPITULATION_DAILY = 400

# 5-day weakness (direction FIXED: HIGH = many stocks down = oversold)
WEAKNESS_5D_BUILDING = 8       # HIGH severity — building weakness
WEAKNESS_5D_CONFIRMED = 12     # CRITICAL severity — confirmed washout

# Strong reversal confirmed
STRONG_REVERSAL = 700

# Day-one recovery
DAY_ONE_RECOVERY = 177

# Easy day — participation ONLY, never inherited from bias branch
BROAD_PARTICIPATION = 200

# Range position (60-day stochastic — empirically strongest correlation)
RANGE_WINDOW = 60
RANGE_FAVORABLE = 45           # <= this = favorable for reversals
RANGE_OVERBOUGHT = 75          # >= this = overextended within own range

# Divergence (fixed window — was len(history)//2 which silently broke)
DIVERGENCE_WINDOW = 6

# Velocity thresholds
VELOCITY_STRONG_DECLINE = -200   # 5-day change
VELOCITY_STRONG_RISE = 300       # 5-day change


# ============================================================
# LAYER 1: CONTEXT ENGINE
# ============================================================

def detect_range_position(history, window=RANGE_WINDOW):
    """
    Where does today sit between the recent high and low of above_20ma?
    Not a fixed number — adapts to each cycle's amplitude.

    0   = at the trailing window's low (favorable for reversals)
    100 = at the trailing window's high (overbought within own range)

    Empirically (254 days, 60-day window):
      0-45  avg fwd_5 = +154  (favorable)
      45-75 avg fwd_5 = -119  (unfavorable)
      75-100 avg fwd_5 = -195 (overextended, avoid)
    """
    if len(history) < window:
        return {"zone": "UNKNOWN", "position": None, "window_high": None, "window_low": None}

    recent = history[:window]
    vals = [d.get("above_20ma", 0) for d in recent]
    hi, lo = max(vals), min(vals)

    if hi == lo:
        return {"zone": "UNKNOWN", "position": None, "window_high": hi, "window_low": lo}

    today = vals[0]
    pos = (today - lo) / (hi - lo) * 100

    if pos <= RANGE_FAVORABLE:
        zone = "RANGE_LOW"
    elif pos >= RANGE_OVERBOUGHT:
        zone = "RANGE_HIGH"
    else:
        zone = "RANGE_MID"

    return {"zone": zone, "position": round(pos, 1), "window_high": hi, "window_low": lo}


def compute_velocity(history):
    """
    Rate of change of above_20ma.
    velocity_1d = today - yesterday
    velocity_5d = today - 5 days ago
    """
    if len(history) < 2:
        return {"velocity_1d": 0, "velocity_5d": 0, "acceleration": 0}

    v_1d = history[0].get("above_20ma", 0) - history[1].get("above_20ma", 0)

    v_5d = 0
    if len(history) >= 5:
        v_5d = history[0].get("above_20ma", 0) - history[4].get("above_20ma", 0)

    # Acceleration: change in 1-day velocity (today vs yesterday)
    acceleration = 0
    if len(history) >= 3:
        vel_yesterday = history[1].get("above_20ma", 0) - history[2].get("above_20ma", 0)
        acceleration = v_1d - vel_yesterday

    return {
        "velocity_1d": v_1d,
        "velocity_5d": v_5d,
        "acceleration": acceleration,
    }


# ============================================================
# LAYER 2: SIGNAL DETECTION
# ============================================================

def classify_market_phase(above_20ma, below_20ma):
    """Classify market into phase based on absolute 20MA levels."""
    total = above_20ma + below_20ma
    if total == 0:
        return {"phase": "UNKNOWN", "confidence": 0}

    pct_above = above_20ma / total

    if above_20ma >= OVERBOUGHT_HARD:
        return {"phase": "EXTREME_OVERBOUGHT", "confidence": 0.95}
    if above_20ma >= OVERBOUGHT_20MA:
        return {"phase": "BULL_OVERBOUGHT", "confidence": 0.9}
    if pct_above >= 0.65:
        return {"phase": "BULL_HEALTHY", "confidence": 0.8}
    if above_20ma <= OVERSOLD_HARD:
        return {"phase": "EXTREME_OVERSOLD", "confidence": 0.95}
    if above_20ma <= OVERSOLD_20MA:
        return {"phase": "BEAR_EXTREME_OVERSOLD", "confidence": 0.9}
    if pct_above <= 0.35:
        return {"phase": "BEAR_WEAK", "confidence": 0.8}
    return {"phase": "TRANSITION", "confidence": 0.5}


def detect_extremes(up_4_5, down_4_5, up_20_5d, down_20_5d, above_20ma):
    """
    Detect extreme readings in breadth data.
    FIXED: down_20_5d direction — HIGH = many stocks down = oversold (was inverted).
    FIXED: CAPITULATION_DAILY from 1200 to 400 (old never fired).
    """
    extremes = []

    if down_4_5 >= CAPITULATION_DAILY:
        extremes.append({
            "type": "CAPITULATION_DAILY",
            "severity": "CRITICAL",
            "column": "down_4_5",
            "value": down_4_5,
            "threshold": CAPITULATION_DAILY,
            "action": "Single-day capitulation — highest probability reversal day",
        })

    # FIXED DIRECTION: down_20_5d HIGH = many stocks broke -20% = real washout
    if down_20_5d >= WEAKNESS_5D_CONFIRMED:
        extremes.append({
            "type": "WEAKNESS_5D_CONFIRMED",
            "severity": "CRITICAL",
            "column": "down_20_5d",
            "value": down_20_5d,
            "threshold": WEAKNESS_5D_CONFIRMED,
            "action": "Confirmed 5-day washout — broad-based weakness",
        })
    elif down_20_5d >= WEAKNESS_5D_BUILDING:
        extremes.append({
            "type": "WEAKNESS_5D_BUILDING",
            "severity": "HIGH",
            "column": "down_20_5d",
            "value": down_20_5d,
            "threshold": WEAKNESS_5D_BUILDING,
            "action": "5-day weakness building — reversal candidates forming",
        })

    if above_20ma >= OVERBOUGHT_20MA:
        extremes.append({
            "type": "OVERBOUGHT_20MA",
            "severity": "HIGH",
            "column": "above_20ma",
            "value": above_20ma,
            "threshold": OVERBOUGHT_20MA,
            "action": "Overbought territory — expect correction",
        })

    if up_4_5 >= STRONG_REVERSAL:
        extremes.append({
            "type": "STRONG_REVERSAL_CONFIRMED",
            "severity": "HIGH",
            "column": "up_4_5",
            "value": up_4_5,
            "threshold": STRONG_REVERSAL,
            "action": "Strong reversal confirmed — rally likely to continue 3-4 days",
        })

    if up_4_5 >= DAY_ONE_RECOVERY:
        extremes.append({
            "type": "DAY_ONE_RECOVERY",
            "severity": "MEDIUM",
            "column": "up_4_5",
            "value": up_4_5,
            "threshold": DAY_ONE_RECOVERY,
            "action": "Day one of recovery after correction",
        })

    if not extremes:
        extremes.append({"type": "NEUTRAL", "severity": "NONE", "action": "No extreme reading"})

    return extremes


def detect_cycle_position(history):
    """
    Detect where we are in the 3-5 day cycle.
    Uses above_20ma trend + up_4_5 trend + 5-day delta.
    """
    if len(history) < 3:
        return {"position": "UNKNOWN", "trend": "NEUTRAL", "five_day_delta": 0}

    recent_3 = history[:3]

    # Check for extended decline (3+ consecutive weak days)
    weak_days = sum(1 for d in recent_3 if d.get("up_4_5", 0) < 100)
    if weak_days >= 3:
        return {
            "position": "CYCLE_EXTENDED_DECLINE",
            "trend": "DETERIORATING",
            "consecutive_decline_days": weak_days,
            "five_day_delta": 0,
        }

    # Check if previous day was extreme selloff (day 1 recovery)
    if len(history) >= 2:
        prev_down = history[1].get("down_4_5", 0)
        if prev_down >= CAPITULATION_DAILY:
            return {
                "position": "CYCLE_DAY_1_UP",
                "trend": "IMPROVING",
                "five_day_delta": 0,
            }

    # Compute 5-day delta
    five_day_delta = 0
    if len(history) >= 5:
        five_day_delta = history[0].get("above_20ma", 0) - history[4].get("above_20ma", 0)

    # Compute trend from last 3 days
    above_vals = [d.get("above_20ma", 0) for d in recent_3]
    up_vals = [d.get("up_4_5", 0) for d in recent_3]

    trend_20ma = above_vals[0] - above_vals[-1]
    trend_up = up_vals[0] - up_vals[-1]

    if trend_20ma > 50 and trend_up > 20:
        return {"position": "CYCLE_MID_UP", "trend": "IMPROVING", "five_day_delta": five_day_delta}

    if trend_20ma < -50 and trend_up < -20:
        return {"position": "CYCLE_MID_DOWN", "trend": "DETERIORATING", "five_day_delta": five_day_delta}

    if five_day_delta <= -150:
        return {"position": "CYCLE_SLOW_BLEED", "trend": "DETERIORATING", "five_day_delta": five_day_delta}

    return {"position": "CYCLE_FLAT", "trend": "NEUTRAL", "five_day_delta": five_day_delta}


def detect_divergence(history, window=DIVERGENCE_WINDOW):
    """
    Detect short-term divergence in above_20ma.
    FIXED: was splitting len(history)//2 which broke with full dataset.
    Now uses fixed 6-day window regardless of history length.
    """
    recent = history[:window]
    if len(recent) < window:
        return {"type": "NONE", "note": f"Need {window} days for divergence"}

    mid = window // 2
    first_half = recent[mid:]   # older half
    second_half = recent[:mid]  # newer half

    avg_first = sum(d.get("above_20ma", 0) for d in first_half) / len(first_half)
    avg_second = sum(d.get("above_20ma", 0) for d in second_half) / len(second_half)

    if avg_second > avg_first + 30:
        return {"type": "BULLISH_DIVERGENCE", "note": "Breadth improving while price may be falling"}
    if avg_second < avg_first - 30:
        return {"type": "BEARISH_DIVERGENCE", "note": "Breadth weakening while price may be rising"}

    return {"type": "NONE", "note": "No divergence"}


def compute_turn_confirmation_score(history):
    """
    ChatGPT's insight: the turning point itself is the signal.
    Counts how many breadth signals agree on a reversal.

    Score 0-7:
      0-2   nothing happening
      3-4   early recovery watch
      5-6   recovery confirmed
      7     strong breadth recovery
    """
    if len(history) < 5:
        return {"score": 0, "signals": [], "label": "INSUFFICIENT_DATA"}

    signals = []

    # Signal 1: 20MA breadth turned upward (today > yesterday)
    if history[0].get("above_20ma", 0) > history[1].get("above_20ma", 0):
        signals.append("20MA_turned_up")

    # Signal 2: 50MA breadth turned upward (if available)
    if history[0].get("above_50ma", 0) > history[1].get("above_50ma", 0):
        signals.append("50MA_turned_up")

    # Signal 3: up_4_5 increasing (more stocks buying today)
    if history[0].get("up_4_5", 0) > history[1].get("up_4_5", 0):
        signals.append("up_4_5_increasing")

    # Signal 4: down_4_5 decreasing (fewer stocks selling today)
    if history[0].get("down_4_5", 0) < history[1].get("down_4_5", 0):
        signals.append("down_4_5_decreasing")

    # Signal 5: down_20_5d decreasing (fewer stocks in deep weakness)
    if history[0].get("down_20_5d", 0) < history[1].get("down_20_5d", 0):
        signals.append("down_20_5d_decreasing")

    # Signal 6: 20MA decline decelerating (acceleration turning positive)
    if len(history) >= 3:
        v_today = history[0].get("above_20ma", 0) - history[1].get("above_20ma", 0)
        v_yesterday = history[1].get("above_20ma", 0) - history[2].get("above_20ma", 0)
        if v_today > v_yesterday:
            signals.append("decline_decelerating")

    # Signal 7: Breadth recovering for 2+ sessions (above_20ma up 2 days in a row)
    if len(history) >= 3:
        if (history[0].get("above_20ma", 0) > history[1].get("above_20ma", 0) and
                history[1].get("above_20ma", 0) > history[2].get("above_20ma", 0)):
            signals.append("2day_recovery")

    score = len(signals)
    if score <= 2:
        label = "NOTHING"
    elif score <= 4:
        label = "EARLY_WATCH"
    elif score <= 6:
        label = "RECOVERY"
    else:
        label = "STRONG_RECOVERY"

    return {"score": score, "signals": signals, "label": label}


# ============================================================
# LAYER 3: BIAS RESOLUTION
# ============================================================

def resolve_bias(phase, extremes, cycle, divergence, range_pos,
                 velocity, turn_score,
                 up_4_5, down_4_5, down_20_5d, above_20ma, below_20ma):
    """
    Priority-based resolution. First match wins.
    Combines Grok's priority logic with ChatGPT's velocity/turn-score concepts.
    """
    bias = {
        "primary_bias": None,
        "setup_preference": None,
        "size_multiplier": 1.0,
        "risk_level": "NORMAL",
        "easy_day": False,
        "reasoning": [],
        "warnings": [],
    }

    extreme_types = [e["type"] for e in extremes]
    deteriorating = cycle.get("trend") == "DETERIORATING"
    improving = cycle.get("trend") == "IMPROVING"
    bearish_div = divergence.get("type") == "BEARISH_DIVERGENCE"
    bullish_div = divergence.get("type") == "BULLISH_DIVERGENCE"
    zone = range_pos.get("zone", "UNKNOWN")
    v5 = velocity.get("velocity_5d", 0)
    accel = velocity.get("acceleration", 0)
    turn = turn_score.get("label", "NOTHING")

    # ── PRIORITY 1: Single-day capitulation — best-confirmed setup ──
    if "CAPITULATION_DAILY" in extreme_types:
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 1.5
        bias["risk_level"] = "LOW"
        bias["reasoning"].append(
            f"CAPITULATION: {down_4_5} stocks fell 4.5%+ today. This kind of mass selling "
            f"happens rarely (only 6 times in 254 days). Historically, the market bounces "
            f"the next day — this is the highest-probability reversal setup."
        )

    # ── PRIORITY 2: Overextended within own range — chase risk ──
    elif zone == "RANGE_HIGH":
        bias["primary_bias"] = "AVOID"
        bias["setup_preference"] = "NONE"
        bias["size_multiplier"] = 0.2
        bias["risk_level"] = "EXTREME"
        pos = range_pos.get("position", 0)
        hi = range_pos.get("window_high", 0)
        lo = range_pos.get("window_low", 0)
        bias["reasoning"].append(
            f"OVEREXTENDED: Market is at the TOP of its own {RANGE_WINDOW}-day range "
            f"(position: {pos:.0f}%). Current: {above_20ma}, Range: {lo}-{hi}. "
            f"Even if other signals say buy, the chase risk is too high here."
        )

    # ── PRIORITY 3: Strong reversal already confirmed ──
    elif "STRONG_REVERSAL_CONFIRMED" in extreme_types:
        bias["primary_bias"] = "CONTINUATIONS"
        bias["setup_preference"] = "CONTINUATION_SETUPS"
        bias["size_multiplier"] = 1.3
        bias["risk_level"] = "LOW"
        bias["reasoning"].append(
            f"REVERSAL CONFIRMED: {up_4_5} stocks rose 4.5%+ today. The bounce has "
            f"already started — ride the move with continuation setups."
        )

    # ── PRIORITY 4: Confirmed 5-day washout AND near range floor ──
    elif "WEAKNESS_5D_CONFIRMED" in extreme_types and zone == "RANGE_LOW":
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 1.3
        bias["risk_level"] = "LOW"
        pos = range_pos.get("position", 0)
        bias["reasoning"].append(
            f"STRONG REVERSAL SIGNAL: {down_20_5d} stocks are down 20%+ in 5 days "
            f"(broad washout confirmed). Market is also near the BOTTOM of its "
            f"{RANGE_WINDOW}-day range ({pos:.0f}%). Both signals agree — high confidence."
        )

    # ── PRIORITY 5: Confirmed 5-day washout alone ──
    elif "WEAKNESS_5D_CONFIRMED" in extreme_types:
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 1.0
        bias["risk_level"] = "NORMAL"
        pos = range_pos.get("position", 0)
        bias["reasoning"].append(
            f"5-DAY WASHOUT: {down_20_5d} stocks are down 20%+ in 5 days — broad "
            f"weakness confirmed. But range position ({pos:.0f}%) is not yet at the "
            f"floor, so not the strongest entry point."
        )

    # ── PRIORITY 6: Moderate weakness + near range floor ──
    elif "WEAKNESS_5D_BUILDING" in extreme_types and zone == "RANGE_LOW":
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 0.9
        bias["risk_level"] = "NORMAL"
        pos = range_pos.get("position", 0)
        bias["reasoning"].append(
            f"REVERSAL CANDIDATES FORMING: {down_20_5d} stocks are down 20%+ in 5 days "
            f"(building weakness). Market is near the BOTTOM of its {RANGE_WINDOW}-day "
            f"range ({pos:.0f}%). The setup is forming in a favorable zone."
        )

    # ── PRIORITY 7: Moderate weakness + deteriorating trend + range not confirming ──
    elif "WEAKNESS_5D_BUILDING" in extreme_types and deteriorating:
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 0.6
        bias["risk_level"] = "HIGH"
        pos = range_pos.get("position", 0)
        bias["reasoning"].append(
            f"WEAK SIGNAL: {down_20_5d} stocks are down 20%+ in 5 days (building), "
            f"but the trend is still FALLING and range position ({pos:.0f}%) is not "
            f"confirming. Reversal candidates exist, but the market hasn't turned yet."
        )

    # ── PRIORITY 8: Moderate weakness alone ──
    elif "WEAKNESS_5D_BUILDING" in extreme_types:
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 0.8
        bias["risk_level"] = "NORMAL"
        bias["reasoning"].append(
            f"WEAKNESS BUILDING: {down_20_5d} stocks are down 20%+ in 5 days. "
            f"Watch for confirmation — need breadth to stabilize before acting."
        )

    # ── PRIORITY 9: Extended decline (3+ weak days) ──
    elif cycle.get("position") == "CYCLE_EXTENDED_DECLINE":
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 0.75
        bias["risk_level"] = "HIGH"
        days = cycle.get("consecutive_decline_days", 0)
        bias["reasoning"].append(
            f"EXTENDED DECLINE: {days} consecutive days of weak breadth (fewer than "
            f"100 stocks up 4.5%+). The selling has been going on for a while — "
            f"reversal is likely forming, but timing is uncertain."
        )

    # ── PRIORITY 10: Healthy bull ──
    elif phase["phase"] == "BULL_HEALTHY":
        bias["primary_bias"] = "CONTINUATIONS"
        bias["setup_preference"] = "CONTINUATION_SETUPS"
        bias["size_multiplier"] = 1.0
        bias["risk_level"] = "NORMAL"
        bias["reasoning"].append(
            f"BULL MARKET: {above_20ma} stocks above 20MA (65%+ of market). "
            f"Most stocks are trending up — continuation setups work best here."
        )

    # ── PRIORITY 11: Improving cycle ──
    elif improving and cycle.get("position") == "CYCLE_MID_UP":
        bias["primary_bias"] = "CONTINUATIONS"
        bias["setup_preference"] = "CONTINUATION_SETUPS"
        bias["size_multiplier"] = 1.0
        bias["risk_level"] = "NORMAL"
        bias["reasoning"].append(
            f"BREADTH IMPROVING: Market is in a mid-cycle up-move. More stocks "
            f"are joining the rally — continuation trades work in this phase."
        )

    # ── PRIORITY 12: Day after capitulation ──
    elif cycle.get("position") == "CYCLE_DAY_1_UP":
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 1.3
        bias["risk_level"] = "LOW"
        bias["reasoning"].append(
            f"DAY AFTER CAPITULATION: Yesterday was a mass selloff. Today is "
            f"day 1 of the recovery — this is where easy money is made."
        )

    # ── PRIORITY 13: Near range floor, no count confirmation ──
    elif zone == "RANGE_LOW":
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 0.5
        bias["risk_level"] = "NORMAL"
        pos = range_pos.get("position", 0)
        hi = range_pos.get("window_high", 0)
        lo = range_pos.get("window_low", 0)
        bias["reasoning"].append(
            f"NEAR RANGE FLOOR: Market is at {pos:.0f}% of its {RANGE_WINDOW}-day range "
            f"(current: {above_20ma}, range: {lo}-{hi}). Favorable zone for reversals, "
            f"but no breadth-count confirmation yet — use small size."
        )

    # ── PRIORITY 14: Bear phase ──
    elif phase["phase"] in ("BEAR_WEAK", "BEAR_EXTREME_OVERSOLD"):
        bias["primary_bias"] = "REVERSALS"
        bias["setup_preference"] = "REVERSAL_SETUPS"
        bias["size_multiplier"] = 0.75
        bias["risk_level"] = "HIGH"
        bias["reasoning"].append(
            f"BEAR PHASE: Only {above_20ma} stocks above 20MA ({phase['phase']}). "
            f"Most stocks are trending down — only take the best reversal setups."
        )

    # ── PRIORITY 15: Transition + deteriorating ──
    elif phase["phase"] == "TRANSITION" and deteriorating:
        bias["primary_bias"] = "FLEXIBLE"
        bias["setup_preference"] = "ANY_SETUP"
        bias["size_multiplier"] = 0.4
        bias["risk_level"] = "HIGH"
        bias["reasoning"].append(
            f"TRANSITION + DECLINING: Market is in no-man's land ({above_20ma} above "
            f"20MA) and breadth is actively deteriorating. Be defensive — reduce size."
        )

    # ── PRIORITY 16: Transition ──
    elif phase["phase"] == "TRANSITION":
        bias["primary_bias"] = "FLEXIBLE"
        bias["setup_preference"] = "ANY_SETUP"
        bias["size_multiplier"] = 0.5
        bias["risk_level"] = "NORMAL"
        bias["reasoning"].append(
            f"TRANSITION: Market is neutral ({above_20ma} above 20MA, "
            f"{(above_20ma/(above_20ma+below_20ma)*100):.0f}% of stocks). Neither clearly "
            f"bull nor bear — focus on individual setup quality."
        )

    # ── DEFAULT ──
    else:
        bias["primary_bias"] = "FLEXIBLE"
        bias["setup_preference"] = "ANY_SETUP"
        bias["size_multiplier"] = 0.5
        bias["risk_level"] = "HIGH"
        bias["reasoning"].append(
            "MIXED SIGNALS: No clear consensus from breadth data. "
            "Reduce size, focus on quality only."
        )

    # ── EASY DAY: participation ONLY, never inherited ──
    bias["easy_day"] = up_4_5 >= BROAD_PARTICIPATION or down_4_5 >= BROAD_PARTICIPATION

    # ── VELOCITY CONTEXT: add context from momentum ──
    if v5 <= VELOCITY_STRONG_DECLINE and deteriorating:
        bias["reasoning"].append(
            f"MOMENTUM: Market lost {abs(v5)} stocks from above-20MA in 5 days. "
            f"This is a strong decline — even if reversal candidates exist, "
            f"the trend is against you. Wait for stabilization."
        )
    elif v5 >= VELOCITY_STRONG_RISE and improving:
        bias["reasoning"].append(
            f"MOMENTUM: Market gained +{v5} stocks above 20MA in 5 days. "
            f"Strong upward momentum — continuation setups have edge."
        )

    # Deceleration detection (ChatGPT's key insight)
    if deteriorating and accel > 0:
        bias["reasoning"].append(
            f"DECELERATING: The decline is SLOWING DOWN (acceleration: +{accel}). "
            f"This means sellers are losing steam — an early sign that a bottom "
            f"may be forming. Not a buy signal yet, but watch closely."
        )

    # ── TURN CONFIRMATION SCORE ──
    if turn in ("RECOVERY", "STRONG_RECOVERY") and bias["primary_bias"] == "REVERSALS":
        score = turn_score.get("score", 0)
        signals = turn_score.get("signals", [])
        signal_names = []
        for s in signals:
            if s == "20MA_turned_up":
                signal_names.append("20MA turned up")
            elif s == "50MA_turned_up":
                signal_names.append("50MA turned up")
            elif s == "up_4_5_increasing":
                signal_names.append("buyers increasing")
            elif s == "down_4_5_decreasing":
                signal_names.append("sellers decreasing")
            elif s == "down_20_5d_decreasing":
                signal_names.append("weakness fading")
            elif s == "decline_decelerating":
                signal_names.append("decline slowing")
            elif s == "2day_recovery":
                signal_names.append("2-day recovery streak")
        if score >= 5:
            bias["reasoning"].append(
                f"RECOVERY CONFIRMED ({score}/7 signals): "
                f"{', '.join(signal_names)}. Multiple breadth measures are turning "
                f"positive at the same time — this is what a real bottom looks like."
            )
            if bias["risk_level"] in ("NORMAL", "HIGH"):
                bias["risk_level"] = "NORMAL"
                bias["size_multiplier"] = min(bias["size_multiplier"] + 0.1, 1.5)
        elif score >= 3:
            bias["reasoning"].append(
                f"EARLY RECOVERY ({score}/7 signals): "
                f"{', '.join(signal_names)}. Some signals are turning, but not all. "
                f"Watch for more confirmation before sizing up."
            )

    # ── OVERLAYS (always applied, after main resolution) ──

    # Bearish divergence: cap size, push risk up
    if bearish_div:
        old_size = bias["size_multiplier"]
        bias["size_multiplier"] = min(bias["size_multiplier"], 0.5)
        if bias["risk_level"] in ("LOW", "NORMAL"):
            bias["risk_level"] = "HIGH"
        bias["warnings"].append(
            f"BEARISH DIVERGENCE: Breadth is weakening (fewer stocks participating) "
            f"while prices may still be rising. This often precedes a correction. "
            f"Size reduced from {old_size:.0%} to {bias['size_multiplier']:.0%}."
        )

    # Bullish divergence: helpful signal
    if bullish_div:
        bias["warnings"].append(
            f"BULLISH DIVERGENCE: Breadth is improving (more stocks participating) "
            f"while prices may still be falling. This often precedes a recovery."
        )

    # Slow bleed warning
    if cycle.get("position") == "CYCLE_SLOW_BLEED":
        delta = cycle.get("five_day_delta", 0)
        bias["warnings"].append(
            f"SLOW BLEED: Market lost {abs(delta)} stocks above 20MA over 5 days. "
            f"The decline is grinding — be patient, don't chase."
        )

    # Choppy 20MA warning
    total_20 = above_20ma + below_20ma
    if total_20 > 0:
        pct = above_20ma / total_20
        if 0.40 < pct < 0.60:
            bias["warnings"].append(
                f"CHOPPY MARKET: Only {pct*100:.0f}% of stocks are above 20MA. "
                f"The market is split 50/50 — continuation setups tend to fail "
                f"in this environment. Reversals may work better."
            )

    # Ensure defaults
    if bias["primary_bias"] is None:
        bias["primary_bias"] = "FLEXIBLE"
    if bias["setup_preference"] is None:
        bias["setup_preference"] = "ANY_SETUP"

    return bias


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def compute_daily_bias() -> dict:
    """
    Read breadth data from SQLite, compute bias for the latest day.
    Returns complete assessment dict for the frontend.
    """
    rows = get_all_breadth()

    if not rows:
        return {
            "date": None,
            "bias": "NO_DATA",
            "setup_preference": "NONE",
            "size_multiplier": 0,
            "easy_day": False,
            "risk_level": "N/A",
            "reasoning": ["No breadth data available. Click 'Update' to calculate."],
            "warnings": [],
            "action_plan": "NO DATA — Click Update to calculate breadth first.",
            "readings": None,
            "phase": "UNKNOWN",
            "cycle": "UNKNOWN",
            "divergence": "NONE",
        }

    latest = rows[0]
    history = rows  # full history — range position needs 60 days

    readings = {
        "up_4_5": latest["up_4_5"],
        "down_4_5": latest["down_4_5"],
        "up_20_5d": latest["up_20_5d"],
        "down_20_5d": latest["down_20_5d"],
        "above_20ma": latest["above_20ma"],
        "below_20ma": latest["below_20ma"],
        "above_50ma": latest["above_50ma"],
        "below_50ma": latest["below_50ma"],
    }

    # Layer 1: Context
    phase = classify_market_phase(readings["above_20ma"], readings["below_20ma"])
    range_pos = detect_range_position(history)
    velocity = compute_velocity(history)

    # Layer 2: Signals
    extremes = detect_extremes(
        readings["up_4_5"], readings["down_4_5"],
        readings["up_20_5d"], readings["down_20_5d"],
        readings["above_20ma"],
    )
    cycle = detect_cycle_position(history)
    divergence = detect_divergence(history)
    turn_score = compute_turn_confirmation_score(history)

    # Layer 3: Resolution
    resolved = resolve_bias(
        phase, extremes, cycle, divergence, range_pos, velocity, turn_score,
        readings["up_4_5"], readings["down_4_5"], readings["down_20_5d"],
        readings["above_20ma"], readings["below_20ma"],
    )

    # Build action plan string
    size = resolved["size_multiplier"]
    primary = resolved["primary_bias"]
    easy = resolved["easy_day"]

    if size == 0.0:
        action_plan = "DO NOT TRADE today. Wait for clearer readings."
    elif size <= 0.4:
        size_label = "MINIMAL SIZE (20-40%)"
        easy_label = "HARD DAY" if not easy else "EASY DAY"
        action_plan = f"{easy_label} | {size_label} | Focus: {primary} | Risk: {resolved['risk_level']}"
    elif size <= 0.6:
        size_label = "REDUCED SIZE (50%)"
        easy_label = "EASY DAY" if easy else "HARD DAY"
        action_plan = f"{easy_label} | {size_label} | Focus: {primary} | Risk: {resolved['risk_level']}"
    elif size <= 1.0:
        size_label = "NORMAL SIZE (75-100%)"
        easy_label = "EASY DAY" if easy else "HARD DAY"
        action_plan = f"{easy_label} | {size_label} | Focus: {primary} | Risk: {resolved['risk_level']}"
    else:
        size_label = f"SIZE UP ({int(size*100)}%)"
        easy_label = "EASY DAY" if easy else "HARD DAY"
        action_plan = f"{easy_label} | {size_label} | Focus: {primary} | Risk: {resolved['risk_level']}"

    return {
        "date": latest["date_key"],
        "bias": primary,
        "setup_preference": resolved["setup_preference"],
        "size_multiplier": size,
        "easy_day": easy,
        "risk_level": resolved["risk_level"],
        "reasoning": resolved["reasoning"],
        "warnings": resolved["warnings"],
        "action_plan": action_plan,
        "readings": readings,
        "phase": phase["phase"],
        "cycle": cycle["position"],
        "divergence": divergence["type"],
        "_debug": {
            "phase": phase,
            "range_position": range_pos,
            "velocity": velocity,
            "extremes": extremes,
            "cycle": cycle,
            "divergence": divergence,
            "turn_score": turn_score,
        },
    }
