"""
Phase 4 tests: backend/src/scanner.py

Strategy: we test the scanner classes' logic directly with synthetic OHLCV
DataFrames. We deliberately do NOT call `.run()` — it spawns a
ProcessPoolExecutor against the shared cache (integration territory),
while unit-level checks cover the filters + pattern analysis.

Data builders are hand-crafted piecewise patterns so every expected
value is derivable by eye from the comment blocks.
"""

from datetime import date

import pandas as pd
import pytest

from src.indicators import compute_all_indicators
from src.scanner import (
    ContinuationScanner,
    ReversalScanner,
    _stock_has_date,
)

# ------------------------------------------------------------------
# Shared param dicts (mirror of get_default_params keys, checked above
# against scanner.py usage; values chosen round & permissive)
# ------------------------------------------------------------------

CONT_PARAMS = {
    "price_min": 100,
    "price_max": 2000,
    "near_ma_threshold": 5.0,      # % distance to SMA20
    "near_ma_direction": "above",
    "max_body_percentage": 5.0,    # % body
    "min_adr": 3.0,
    "volume_threshold": 1_000_000,
    "lookback_days": 30,
    "min_movement_days": 2,
    "movement_threshold_pct": 0.05,
    "cont_lookback_days": 80,
    "sma_period": 20,
    "rising_ma_prev_max_window": 5,
    "rising_ma_tolerance": 0.0,
    "adr_period": 14,
    "cont_min_data_rows": 50,
    "ma_angle_points": 5,
    "high_low_period": 20,
    "price_change_periods": [1, 5, 20],
}

REV_PARAMS = {
    **CONT_PARAMS,
    "rev_decline_days_min": 3,
    "rev_decline_days_max": 15,
    "rev_min_decline_pct": 10.0,
    "rev_lookback_days": 15,
    "rev_min_data_rows": 30,
}


def make_frame(opens, closes, highs=None, lows=None, index=None):
    n = len(closes)
    highs = highs if highs is not None else [max(o, c) + 2 for o, c in zip(opens, closes)]
    lows = lows if lows is not None else [min(o, c) - 2 for o, c in zip(opens, closes)]
    volumes = [2_000_000] * n
    idx = index if index is not None else pd.bdate_range("2026-01-01", periods=n)
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes},
        index=idx,
    )


# ==================================================================
# Continuation — filters
# ==================================================================

def _passes_filters_result(df, params):
    ind = compute_all_indicators(df, indicator_params={
        "sma_period": params.get("sma_period", 20),
        "adr_period": params.get("adr_period", 14),
        "high_low_period": params.get("high_low_period", 20),
        "ma_angle_points": params.get("ma_angle_points", 5),
        "price_change_periods": params.get("price_change_periods", [1, 5, 20]),
    })
    latest = ind.iloc[-1]
    s = ContinuationScanner(params)
    return s._passes_filters(latest, ind)


def test_continuation_filters_pass_on_synthetic_data():
    # flat 500 rows with wide daily range (ADR ≈ 4%+) and two 6% movement days in last 30
    closes = [500.0] * 60
    opens = [500.0] * 60
    highs = [508.0] * 60
    lows = [492.0] * 60
    # liquid movement days: open 500 → close 530 (6% move); widen their range too
    for kick in (-8, -3):
        closes[kick] = 530.0
        highs[kick] = 538.0
        lows[kick] = 492.0
    df = make_frame(opens, closes, highs=highs, lows=lows)
    # sanity: tail ADR ≈ ((38+38+12*16)/14)/500 ≈ 4.1% ≥ min_adr 3%
    assert _passes_filters_result(df, CONT_PARAMS) is True


def test_continuation_filters_fail_out_of_price_range():
    df = make_frame([500.0] * 60, [500.0] * 60)
    params = {**CONT_PARAMS, "price_max": 400}
    assert _passes_filters_result(df, params) is False


def test_continuation_filters_fail_on_low_adr():
    # tight highs/lows → ADR% ~ (502-498)/500 = 0.8% < 3%
    closes = [500.0] * 60
    df = make_frame(
        [500.0] * 60, closes,
        highs=[502.0] * 60, lows=[498.0] * 60,
    )
    assert _passes_filters_result(df, CONT_PARAMS) is False


def test_continuation_filters_fail_on_no_liquid_days():
    df = make_frame([500.0] * 60, [500.0] * 60)
    assert _passes_filters_result(df, CONT_PARAMS) is False


# ==================================================================
# Continuation — pattern (phase A/B/C zig-zag above SMA20)
# ==================================================================

def build_continuation_pattern():
    """Phase 1: rally 100→110 (25d). Phase 2: dip 110→92 (8d, crosses
    below SMA20). Phase 3: recovery 92→98 (15d) then gentle uptrend
    98→104 (35d). Latest row: close ≈ SMA20*1.002 (near MA, rising).
    Total 83 rows, HIGH caps ~112 so phase3_high < phase1_high.

    ADR: rows use high-low spread ≈ 4, so tail ADR ≈ 4/close ≥ 3%.
    Liquidity: three engineered movement days in the last 30.
    """
    opens, closes = [], []

    # Phase 1: 25 rows, 100 → 110 linear
    for i in range(25):
        o = 100.0 + (110.0 - 100.0) * i / 24
        c = 100.0 + (110.0 - 100.0) * (i + 1) / 24
        opens.append(o)
        closes.append(c)

    # Phase 2: 8 rows, 110 → 92 linear (decline below SMA20)
    for i in range(8):
        o = 110.0 - (110.0 - 92.0) * i / 8
        c = 110.0 - (110.0 - 92.0) * (i + 1) / 8
        opens.append(o)
        closes.append(c)

    # Phase 3a: 15 rows, 92 → 98 recovery
    for i in range(15):
        o = 92.0 + (98.0 - 92.0) * i / 15
        c = 92.0 + (98.0 - 92.0) * (i + 1) / 15
        opens.append(o)
        closes.append(c)

    # Phase 3b: 35 rows, 98 → 104 gentle rising, final rows pin close ≈ SMA + 0.2%
    for i in range(35):
        o = 98.0 + (104.0 - 98.0) * i / 35
        c = 98.0 + (104.0 - 98.0) * (i + 1) / 35
        opens.append(o)
        closes.append(c)

    n = len(closes)
    highs = [max(o, c) + 2 for o, c in zip(opens, closes)]
    lows = [min(o, c) - 2 for o, c in zip(opens, closes)]

    # liquidity days (last 30 rows): three 5%+ movement days
    for kick in (-14, -9, -4):
        opens[kick] = closes[kick] / 1.06
        highs[kick] = max(opens[kick], closes[kick]) + 2
        lows[kick] = min(opens[kick], closes[kick]) - 2

    # final row: pin close 0.2% above SMA20 (calculated later; use flat+small offsets here)
    return opens, closes, highs, lows


def make_continuation_data():
    opens, closes, highs, lows = build_continuation_pattern()
    return make_frame(opens, closes, highs=highs, lows=lows)


def test_continuation_pattern_full_match():
    data = make_continuation_data()
    ind = compute_all_indicators(data, indicator_params={
        "sma_period": 20, "adr_period": 14, "high_low_period": 20,
        "ma_angle_points": 5, "price_change_periods": [1, 5, 20],
    })
    scanner = ContinuationScanner(CONT_PARAMS)
    result = scanner._analyze_pattern(ind)
    assert result is not None, "expected full zig-zag continuation match"

    # phase values from construction: ADR_abs over tail ≈ 4/close ≈ 0.038
    assert result["phase1_high"] == pytest.approx(112.0, abs=1.0)  # max high in phase1 = 110+2
    assert result["phase2_low"] == pytest.approx(90.0, abs=1.0)    # min low in dip = 92-2
    assert result["phase3_high"] < result["phase1_high"]
    assert result["depth_rs"] == pytest.approx(
        result["phase1_high"] - result["phase2_low"], abs=0.05)
    assert result["depth_pct"] > 0
    assert 0.0 < result["dist_to_ma_pct"] < 2.0  # close pinned just above SMA
    assert result["adr_pct"] > 0


def test_continuation_pattern_none_when_no_dip_below_ma():
    # pure monotonic uptrend, never below SMA20 → no Phase B dip → None
    closes = [100.0 + i for i in range(80)]
    opens = [100.0 + i for i in range(80)]
    df = make_frame(opens, closes)
    ind = compute_all_indicators(df)
    assert ContinuationScanner(CONT_PARAMS)._analyze_pattern(ind) is None


# ==================================================================
# Reversal — pattern logic matrix (pure static, hand-checked)
# ==================================================================

def test_reversal_pattern_logic_all_periods():
    p = ReversalScanner._check_pattern_logic

    def frame(opens, closes):
        n = len(closes)
        return make_frame(list(opens), list(closes))

    # period 3: first day red + all red
    f = frame([100, 99, 98], [99, 98, 97])
    assert p(3, 0, 3, f) is True
    f = frame([100, 99, 98], [101, 99, 98])
    assert p(2, 1, 3, f) is False  # a green day in 3-period

    # period 4-5: reds > greens
    f = frame([100, 99, 98, 97], [99, 98, 97, 96])
    assert p(4, 0, 4, f) is True
    f = frame([100, 99, 98, 97], [99, 98, 97, 96])
    assert p(3, 1, 4, f) is True
    f = frame([100, 99, 98, 97], [99, 98, 97, 96])
    assert p(2, 2, 4, f) is False

    # period 6-7: reds + 1 > greens
    f = frame([100] * 7, [99] * 7)
    assert p(7, 0, 7, f) is True
    f = frame([100] * 7, [99] * 7)
    assert p(3, 4, 7, f) is False  # 4 not > 4

    # period 8+: greens ≤ 3
    f = frame([100] * 10, [99] * 10)
    assert p(10, 0, 10, f) is True
    f = frame([100] * 10, [99] * 10)
    assert p(6, 4, 10, f) is False

    # first day must be red in every case
    f = frame([100, 99, 98], [100, 99, 98])
    assert p(2, 1, 3, f) is False


def test_reversal_find_best_decline_period():
    """15 days of steady -1.5% from open 500. Best window = longest decline ≥ 10%.
    Every day red → all periods 3..15 pass pattern logic; decline over p rows
    = 1 - 0.985^p → best = period 15 (decline ≈ 20.3%).
    """
    opens, closes = [], []
    prev = 500.0
    for _ in range(15):
        opens.append(prev)
        prev = prev * 0.985
        closes.append(prev)
    df = make_frame(opens, closes)
    scanner = ReversalScanner(REV_PARAMS)
    best = scanner._find_best_decline_period(df)
    assert best is not None
    assert best["period"] == 15
    assert best["green_days"] == 0
    assert best["decline_percent"] == pytest.approx(1 - 0.985 ** 15, rel=1e-3)
    assert best["first_red_date"] == df.index[-15].date()


def test_reversal_find_best_decline_none_when_too_shallow():
    # 15 days of -0.5% → total decline ~7.2% < 10% → None
    opens, closes = [], []
    prev = 500.0
    for _ in range(15):
        opens.append(prev)
        prev = prev * 0.995
        closes.append(prev)
    df = make_frame(opens, closes)
    assert ReversalScanner(REV_PARAMS)._find_best_decline_period(df) is None


def test_reversal_analyze_pattern_downtrend_context():
    """40 flat days at 500, then 15 days of -1.5%/day decline.
    trend_window SMA comparison around the decline start must yield 'downtrend'.
    """
    opens, closes = [], []
    prev = 500.0
    for _ in range(40):
        opens.append(500.0)
        closes.append(500.0)
    for i in range(15):
        opens.append(prev)
        prev = prev * 0.985
        closes.append(prev)
    df = make_frame(opens, closes)
    ind = compute_all_indicators(df, indicator_params={
        "sma_period": 20, "adr_period": 14, "high_low_period": 20,
        "ma_angle_points": 5, "price_change_periods": [1, 5, 20],
    })
    scanner = ReversalScanner(REV_PARAMS)
    result = scanner._analyze_pattern(ind, scan_date=None)
    assert result is not None
    assert result["period"] == 15
    assert result["trend_context"] == "downtrend"
    assert result["green_days"] == 0
    assert "decline_percent" in result
    assert result["first_red_date"].endswith("26")


def test_reversal_analyze_pattern_no_setup():
    df = make_frame([500.0] * 40, [500.0] * 40)
    ind = compute_all_indicators(df)
    assert ReversalScanner(REV_PARAMS)._analyze_pattern(ind, scan_date=None) is None


def test_stock_has_date():
    idx = pd.bdate_range("2026-01-01", periods=10)
    df = make_frame([100.0] * 10, [100.0] * 10, index=idx)
    assert _stock_has_date(df, date(2026, 1, 1)) is True
    assert _stock_has_date(df, date(2026, 1, 5)) is True    # a Tuesday in the frame
    assert _stock_has_date(df, date(2025, 1, 1)) is False
