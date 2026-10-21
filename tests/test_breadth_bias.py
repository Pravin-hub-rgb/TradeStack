"""
Phase 4 tests: backend/src/breadth_bias.py — the bias engine.

Replaces the old date-dependent scripts (test_bias_2026_08_19.py /
test_bias_engine.py, which depended on live SQLite rows existing for
hardcoded calendar dates). Here every case is SYNTHETIC history
(newest-first lists of row-dicts), so tests are date-independent and
run green regardless of what breadth data exists.

Integration: compute_daily_bias() is tested by seeding the tmp DB.
"""

import pytest

from src import db
from src.breadth_bias import (
    BROAD_PARTICIPATION,
    classify_market_phase,
    compute_daily_bias,
    compute_turn_confirmation_score,
    compute_velocity,
    detect_cycle_position,
    detect_divergence,
    detect_extremes,
    detect_range_position,
    resolve_bias,
)


def day(**kw):
    """Row dict with neutral defaults; only pass what matters for the case."""
    base = dict(
        up_4_5=150, down_4_5=100, up_20_5d=3, down_20_5d=5,
        above_20ma=1000, below_20ma=1000, above_50ma=800, below_50ma=1200,
    )
    base.update(kw)
    return base


def history(*rows, fill=0):
    """Newest-first history padded with neutral days at the oldest end."""
    pad = [day(up_4_5=150, down_4_5=100) for _ in range(fill)]
    return list(rows) + pad


NEUTRAL_CYCLE = {"position": "CYCLE_FLAT", "trend": "NEUTRAL", "five_day_delta": 0}
NO_DIV = {"type": "NONE", "note": "No divergence"}
MID_RANGE = {"zone": "RANGE_MID", "position": 50.0, "window_high": 1200, "window_low": 400}
ZERO_VEL = {"velocity_1d": 0, "velocity_5d": 0, "acceleration": 0}
NOTHING_TURN = {"score": 0, "signals": [], "label": "NOTHING"}
TRANSITION_PHASE = {"phase": "TRANSITION", "confidence": 0.5}

QUIET_EXTREMES = lambda: detect_extremes(150, 100, 3, 5, 800)  # noqa: E731 — plain NEUTRAL read


def resolve(phase, extremes, cycle=NEUTRAL_CYCLE, div=NO_DIV, rng=MID_RANGE,
            vel=ZERO_VEL, turn=NOTHING_TURN, up=150, down=90, down20=5,
            above=1000, below=1000):
    return resolve_bias(phase, extremes, cycle, div, rng, vel, turn,
                        up, down, down20, above, below)


# ==================================================================
# classify_market_phase
# ==================================================================

def test_phase_classify_matrix():
    cases = [
        ((2000, 500), "EXTREME_OVERBOUGHT"),   # ≥ 2000 hard cap
        ((1600, 400), "BULL_OVERBOUGHT"),      # ≥ 1500
        ((1300, 700), "BULL_HEALTHY"),         # pct_above ≥ 0.65
        ((500, 1500), "BEAR_EXTREME_OVERSOLD"),  # ≤ 500
        ((250, 1750), "EXTREME_OVERSOLD"),     # ≤ 300
        ((700, 1300), "BEAR_WEAK"),            # pct ≤ 0.35
        ((1000, 1000), "TRANSITION"),
        ((0, 0), "UNKNOWN"),
    ]
    for (above, below), expected in cases:
        assert classify_market_phase(above, below)["phase"] == expected, (above, below)


# ==================================================================
# detect_extremes
# ==================================================================

def test_extremes_neutral():
    ext = QUIET_EXTREMES()
    assert ext == [{"type": "NEUTRAL", "severity": "NONE", "action": "No extreme reading"}]


def test_extremes_capitulation_daily_at_400():
    ext = detect_extremes(up_4_5=50, down_4_5=400, up_20_5d=2, down_20_5d=0, above_20ma=800)
    types = [e["type"] for e in ext]
    assert "CAPITULATION_DAILY" in types
    e = ext[0]
    assert e["severity"] == "CRITICAL"
    assert e["threshold"] == 400


def test_extremes_weakness_5d_directional_fix():
    # HIGH down_20_5d = oversold (was inverted in v1)
    building = detect_extremes(50, 90, 2, 8, 800)
    assert building[0]["type"] == "WEAKNESS_5D_BUILDING"
    confirmed = detect_extremes(50, 90, 2, 12, 800)
    assert confirmed[0]["type"] == "WEAKNESS_5D_CONFIRMED"
    # only one weakness extreme (else-if between building/confirmed)
    assert len(confirmed) == 1


def test_extremes_overbought_and_reversal_and_day_one():
    overbought = detect_extremes(100, 90, 3, 5, 1500)
    assert overbought[0]["type"] == "OVERBOUGHT_20MA"

    strong = detect_extremes(700, 90, 3, 5, 800)
    types = [e["type"] for e in strong]
    assert "STRONG_REVERSAL_CONFIRMED" in types
    assert "DAY_ONE_RECOVERY" in types      # day-one also fires at ≥ 177

    day_one_only = detect_extremes(177, 90, 3, 5, 800)   # below STRONG_REVERSAL
    types = [e["type"] for e in day_one_only]
    assert "DAY_ONE_RECOVERY" in types
    assert "STRONG_REVERSAL_CONFIRMED" not in types


# ==================================================================
# detect_range_position (60-day stochastic)
# ==================================================================

def _range_history(today_val, window_vals_ascending):
    """60 newest-first rows. today = history[0]."""
    rows = [day(above_20ma=today_val)] + [
        day(above_20ma=v) for v in window_vals_ascending
    ]
    assert len(rows) == 60
    return rows


def test_range_position_at_low():
    vals = [400 + (v * 10) for v in range(59)]  # 400..980 (59 values), no duplicate of 400
    out = detect_range_position(_range_history(400, vals))
    assert out["zone"] == "RANGE_LOW"
    assert out["position"] == 0.0
    assert out["window_high"] == 980 and out["window_low"] == 400


def test_range_position_at_high():
    vals = [400 + (v * 10) for v in range(59)]
    out = detect_range_position(_range_history(980, vals))   # today == window max
    assert out["zone"] == "RANGE_HIGH"
    assert out["position"] == 100.0


def test_range_position_mid():
    vals = [400 + (v * 10) for v in range(59)]
    out = detect_range_position(_range_history(690, vals))   # exact midpoint of 400..980
    assert out["zone"] == "RANGE_MID"
    assert out["position"] == pytest.approx(50.0)


def test_range_position_flat_and_short():
    flat = history(*[day() for _ in range(60)])
    out = detect_range_position(flat)
    assert out["zone"] == "UNKNOWN"
    out2 = detect_range_position(history(*[day() for _ in range(59)]))
    assert out2["zone"] == "UNKNOWN"


# ==================================================================
# compute_velocity
# ==================================================================

def test_velocity_1d_5d_acceleration():
    h = history(
        day(above_20ma=1200),
        day(above_20ma=1150),
        day(above_20ma=1180),
        day(above_20ma=1100),
        day(above_20ma=1050),
    )
    v = compute_velocity(h)
    assert v["velocity_1d"] == 50            # 1200 - 1150
    assert v["velocity_5d"] == 150           # 1200 - 1050
    assert v["acceleration"] == 80           # 50 - (1150 - 1180)


def test_velocity_short_history_zero():
    v = compute_velocity(history(day(above_20ma=1000)))
    assert v == {"velocity_1d": 0, "velocity_5d": 0, "acceleration": 0}


# ==================================================================
# detect_cycle_position
# ==================================================================

def test_cycle_extended_decline():
    h = history(day(up_4_5=50), day(up_4_5=50), day(up_4_5=50), day(up_4_5=50))
    c = detect_cycle_position(h)
    assert c["position"] == "CYCLE_EXTENDED_DECLINE"
    assert c["trend"] == "DETERIORATING"
    assert c["consecutive_decline_days"] == 3


def test_cycle_day1_after_capitulation():
    h = history(
        day(up_4_5=150, down_4_5=100),   # today: recovering
        day(up_4_5=80, down_4_5=500),    # yesterday: capitulation (≥ 400)
        day(up_4_5=150, down_4_5=100),
        day(up_4_5=150, down_4_5=100),
    )
    c = detect_cycle_position(h)
    assert c["position"] == "CYCLE_DAY_1_UP"
    assert c["trend"] == "IMPROVING"


def test_cycle_mid_up_and_mid_down():
    up = history(
        day(above_20ma=1200, up_4_5=160),
        day(above_20ma=1150, up_4_5=140),
        day(above_20ma=1100, up_4_5=130),
        day(above_20ma=1090),
        day(above_20ma=1080),
    )
    assert detect_cycle_position(up)["position"] == "CYCLE_MID_UP"

    down = history(
        day(above_20ma=1000, up_4_5=105),
        day(above_20ma=1080, up_4_5=130),
        day(above_20ma=1120, up_4_5=145),
        day(above_20ma=1130),
        day(above_20ma=1140),
    )
    assert detect_cycle_position(down)["position"] == "CYCLE_MID_DOWN"


def test_cycle_slow_bleed_and_flat():
    bleed = history(
        day(above_20ma=1000, up_4_5=120),
        day(above_20ma=1005, up_4_5=118),
        day(above_20ma=1008, up_4_5=119),
        day(above_20ma=1190),
        day(above_20ma=1200),
    )
    c = detect_cycle_position(bleed)
    assert c["position"] == "CYCLE_SLOW_BLEED"
    assert c["five_day_delta"] == -200

    flat = history(*[day() for _ in range(5)])
    assert detect_cycle_position(flat)["position"] == "CYCLE_FLAT"


# ==================================================================
# detect_divergence (fixed 6-day window)
# ==================================================================

def test_divergence_bullish_bearish_none():
    bull = history(
        day(above_20ma=1100), day(above_20ma=1105), day(above_20ma=1110),
        day(above_20ma=1000), day(above_20ma=1000), day(above_20ma=1000),
    )
    assert detect_divergence(bull)["type"] == "BULLISH_DIVERGENCE"

    bear = history(
        day(above_20ma=900), day(above_20ma=895), day(above_20ma=890),
        day(above_20ma=1000), day(above_20ma=1000), day(above_20ma=1000),
    )
    assert detect_divergence(bear)["type"] == "BEARISH_DIVERGENCE"

    none = history(*[day(above_20ma=1000)] * 6)
    assert detect_divergence(none)["type"] == "NONE"


def test_divergence_needs_full_window():
    out = detect_divergence(history(*[day() for _ in range(5)]))
    assert out["type"] == "NONE"
    assert "6" in out["note"]


# ==================================================================
# compute_turn_confirmation_score
# ==================================================================

def test_turn_score_all_seven_signals():
    h = history(
        day(above_20ma=1100, above_50ma=600, up_4_5=200, down_4_5=100, down_20_5d=5),
        day(above_20ma=1080, above_50ma=590, up_4_5=180, down_4_5=150, down_20_5d=10),
        day(above_20ma=1070, above_50ma=585, up_4_5=170, down_4_5=170, down_20_5d=14),
        day(above_20ma=1060, above_50ma=580, up_4_5=160, down_4_5=180, down_20_5d=16),
        day(above_20ma=1050, above_50ma=575, up_4_5=150, down_4_5=190, down_20_5d=18),
    )
    t = compute_turn_confirmation_score(h)
    assert t["score"] == 7
    assert t["label"] == "STRONG_RECOVERY"
    assert "20MA_turned_up" in t["signals"]
    assert "2day_recovery" in t["signals"]


def test_turn_score_insufficient_data():
    h = history(*[day() for _ in range(4)])
    assert compute_turn_confirmation_score(h)["label"] == "INSUFFICIENT_DATA"


# ==================================================================
# resolve_bias — priority ladder (first match wins)
# ==================================================================

def test_p1_capitulation_reversals_sizeup():
    ext = detect_extremes(50, 500, 2, 5, 800)
    b = resolve(TRANSITION_PHASE, ext, up=50, down=500)
    assert b["primary_bias"] == "REVERSALS"
    assert b["size_multiplier"] == 1.5
    assert b["risk_level"] == "LOW"
    assert "CAPITULATION" in b["reasoning"][0]
    assert b["easy_day"] is True    # down_4_5 = 500 ≥ BROAD_PARTICIPATION (200)


def test_easy_day_none_when_quiet():
    ext = detect_extremes(150, 90, 3, 5, 800)
    b = resolve(TRANSITION_PHASE, ext, up=150, down=90)
    assert b["easy_day"] is False   # both counts < 200


def test_p2_range_high_avoid():
    b = resolve(TRANSITION_PHASE, QUIET_EXTREMES(),
                rng={"zone": "RANGE_HIGH", "position": 95, "window_high": 1200, "window_low": 400})
    assert b["primary_bias"] == "AVOID"
    assert b["size_multiplier"] == 0.2
    assert b["risk_level"] == "EXTREME"


def test_p3_strong_reversal_continuations():
    ext = detect_extremes(800, 90, 3, 5, 800)
    b = resolve(TRANSITION_PHASE, ext, up=800, down=90)
    assert b["primary_bias"] == "CONTINUATIONS"
    assert b["size_multiplier"] == 1.3
    assert b["risk_level"] == "LOW"
    assert b["easy_day"] is True    # up 800 ≥ 200


def test_p4_p5_washout_confirmed():
    ext = detect_extremes(50, 90, 3, 14, 800)
    assert ext[0]["type"] == "WEAKNESS_5D_CONFIRMED"
    low = resolve(TRANSITION_PHASE, ext,
                  rng={"zone": "RANGE_LOW", "position": 8, "window_high": 1200, "window_low": 400},
                  down20=14)
    assert low["primary_bias"] == "REVERSALS" and low["size_multiplier"] == 1.3
    mid = resolve(TRANSITION_PHASE, ext, down20=14)
    assert mid["primary_bias"] == "REVERSALS" and mid["size_multiplier"] == 1.0


def test_p6_p7_p8_weakness_building():
    ext = detect_extremes(50, 90, 3, 9, 800)
    low = resolve(TRANSITION_PHASE, ext,
                  rng={"zone": "RANGE_LOW", "position": 20, "window_high": 1200, "window_low": 400},
                  down20=9)
    assert low["size_multiplier"] == 0.9

    deteriorating = {"position": "CYCLE_MID_DOWN", "trend": "DETERIORATING", "five_day_delta": -80}
    weak = resolve(TRANSITION_PHASE, ext, cycle=deteriorating, down20=9)
    assert weak["size_multiplier"] == 0.6
    assert weak["risk_level"] == "HIGH"

    plain = resolve(TRANSITION_PHASE, ext, down20=9)
    assert plain["size_multiplier"] == 0.8
    assert plain["risk_level"] == "NORMAL"


def test_p9_extended_decline_with_momentum_and_turn():
    ext = QUIET_EXTREMES()
    cycle = {"position": "CYCLE_EXTENDED_DECLINE", "trend": "DETERIORATING",
             "consecutive_decline_days": 4, "five_day_delta": -200}
    vel = {"velocity_1d": -30, "velocity_5d": -300, "acceleration": 10}
    turn = {"score": 5, "signals": ["20MA_turned_up", "up_4_5_increasing"], "label": "RECOVERY"}
    b = resolve(TRANSITION_PHASE, ext, cycle=cycle, vel=vel, turn=turn)
    assert b["primary_bias"] == "REVERSALS"
    assert b["size_multiplier"] == pytest.approx(0.85)     # 0.75 + 0.1 turn bump
    assert b["risk_level"] == "NORMAL"                     # HIGH → NORMAL via turn >= 5
    assert any("MOMENTUM" in r for r in b["reasoning"])
    assert any("RECOVERY CONFIRMED" in r for r in b["reasoning"])


def test_p10_bull_healthy():
    b = resolve({"phase": "BULL_HEALTHY", "confidence": 0.8}, QUIET_EXTREMES(),
                above=1300, below=700)
    assert b["primary_bias"] == "CONTINUATIONS"
    assert b["size_multiplier"] == 1.0


def test_p11_improving_mid_up():
    cycle = {"position": "CYCLE_MID_UP", "trend": "IMPROVING", "five_day_delta": 100}
    b = resolve(TRANSITION_PHASE, QUIET_EXTREMES(), cycle=cycle)
    assert b["primary_bias"] == "CONTINUATIONS"
    assert b["size_multiplier"] == 1.0


def test_p12_day1_after_capitulation():
    cycle = {"position": "CYCLE_DAY_1_UP", "trend": "IMPROVING", "five_day_delta": 0}
    b = resolve(TRANSITION_PHASE, QUIET_EXTREMES(), cycle=cycle)
    assert b["primary_bias"] == "REVERSALS"
    assert b["size_multiplier"] == 1.3
    assert b["risk_level"] == "LOW"


def test_p13_range_floor_no_confirmation():
    b = resolve(TRANSITION_PHASE, QUIET_EXTREMES(),
                rng={"zone": "RANGE_LOW", "position": 5, "window_high": 1200, "window_low": 400})
    assert b["primary_bias"] == "REVERSALS"
    assert b["size_multiplier"] == 0.5


def test_p14_bear_weak():
    b = resolve({"phase": "BEAR_WEAK", "confidence": 0.8}, QUIET_EXTREMES(), above=700, below=1300)
    assert b["primary_bias"] == "REVERSALS"
    assert b["size_multiplier"] == 0.75
    assert b["risk_level"] == "HIGH"


def test_p15_p16_transition():
    deteriorating = {"position": "CYCLE_MID_DOWN", "trend": "DETERIORATING", "five_day_delta": -80}
    b15 = resolve(TRANSITION_PHASE, QUIET_EXTREMES(), cycle=deteriorating)
    assert b15["primary_bias"] == "FLEXIBLE"
    assert b15["size_multiplier"] == 0.4
    assert b15["risk_level"] == "HIGH"

    b16 = resolve(TRANSITION_PHASE, QUIET_EXTREMES())
    assert b16["primary_bias"] == "FLEXIBLE"
    assert b16["size_multiplier"] == 0.5
    assert b16["risk_level"] == "NORMAL"


def test_overlays_bearish_divergence_and_choppy_and_slow_bleed():
    b = resolve({"phase": "BULL_HEALTHY", "confidence": 0.8}, QUIET_EXTREMES(),
                div={"type": "BEARISH_DIVERGENCE", "note": ""},
                cycle={"position": "CYCLE_SLOW_BLEED", "trend": "NEUTRAL", "five_day_delta": -180},
                above=1300, below=700)
    assert b["size_multiplier"] == pytest.approx(0.5)   # capped from 1.0
    assert b["risk_level"] == "HIGH"
    assert any("BEARISH DIVERGENCE" in w for w in b["warnings"])
    assert any("SLOW BLEED" in w for w in b["warnings"])

    choppy = resolve(TRANSITION_PHASE, QUIET_EXTREMES(), above=1000, below=1000)
    assert any("CHOPPY MARKET" in w for w in choppy["warnings"])


# ==================================================================
# Integration: compute_daily_bias over seeded tmp DB
# ==================================================================

def test_compute_daily_bias_seeded_capitulation_day(clean_db):
    # 80 business days ending in a single-day capitulation (down_4_5 = 500)
    import pandas as pd

    dates = pd.bdate_range("2026-01-05", periods=80)
    for i, d in enumerate(dates):
        is_latest = i == 79
        db.upsert_breadth(
            d.strftime("%Y-%m-%d"),
            up_4_5=50 if is_latest else 150,
            down_4_5=500 if is_latest else 100,
            up_20_5d=2 if is_latest else 3,
            down_20_5d=5,
            above_20ma=1000,
            below_20ma=1000,
            stocks_with_data=2500 if is_latest else 2510,
        )
    out = compute_daily_bias()
    assert out["date"] == dates[-1].strftime("%Y-%m-%d")
    assert out["bias"] == "REVERSALS"
    assert out["easy_day"] is True            # down_4_5 = 500 ≥ 200
    assert out["size_multiplier"] == 1.5
    assert out["phase"] == "TRANSITION"
    assert "EASY DAY" in out["action_plan"]
    assert any("CAPITULATION" in r for r in out["reasoning"])
    assert out["_debug"]["extremes"][0]["type"] == "CAPITULATION_DAILY"


def test_compute_daily_bias_no_data(clean_db):
    out = compute_daily_bias()
    assert out["bias"] == "NO_DATA"
    assert out["date"] is None
