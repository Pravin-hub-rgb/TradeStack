"""
Phase 4 tests: backend/src/indicators.py — pure functions, hand-computed expectations.

Every expected value below is derived manually from the formula, not from
running the code, so a regression in the formula will fail loudly.
"""

import math

import numpy as np
import pandas as pd
import pytest

from src.indicators import (
    calc_sma,
    calc_adr,
    calc_adr_absolute,
    calc_ma_angle,
    calc_price_change,
    calc_high_low_distances,
    compute_all_indicators,
    check_price_range,
    check_adr_threshold,
    check_liquidity,
)


def make_df(closes, opens=None, highs=None, lows=None, volumes=None):
    n = len(closes)
    opens = opens if opens is not None else closes
    highs = highs if highs is not None else [c + 1 for c in closes]
    lows = lows if lows is not None else [c - 1 for c in closes]
    volumes = volumes if volumes is not None else [2_000_000] * n
    return pd.DataFrame(
        {
            "open": list(opens),
            "high": list(highs),
            "low": list(lows),
            "close": list(closes),
            "volume": list(volumes),
        },
        index=pd.bdate_range("2026-01-01", periods=n),
    )


# ---------- calc_sma ----------

def test_calc_sma_constant_series():
    df = make_df([100.0] * 30)
    sma = calc_sma(df, period=20)
    assert isinstance(sma, pd.Series)
    assert len(sma) == 30
    # first 19 values are NaN (window not full)
    assert sma.iloc[:19].isna().all()
    # from index 19 onward the value is exactly 100
    assert (sma.iloc[19:] == 100.0).all()


def test_calc_sma_known_rising_series():
    # close = 10, 20, 30 ... last 3-window value = (130 + 140 + 150)/3 hand-computed on tail
    df = make_df([10.0 * i for i in range(1, 26)])
    sma = calc_sma(df, period=3)
    # rolling(3).mean() at last row = (230+240+250)/3
    assert sma.iloc[-1] == pytest.approx(240.0)


def test_calc_sma_empty_df():
    sma = calc_sma(pd.DataFrame({"close": pd.Series(dtype=float)}), period=20)
    assert isinstance(sma, pd.Series)
    assert sma.empty


# ---------- calc_adr / adr_absolute ----------

def test_calc_adr_fixed_20pct_range():
    # high=110, low=90, close=100 every day → daily range = 20 → ADR% = 20/100*100 = 20
    closes = [100.0] * 20
    df = make_df(closes, highs=[110.0] * 20, lows=[90.0] * 20)
    adr = calc_adr(df, period=14)
    assert adr.iloc[:13].isna().all()
    assert adr.iloc[14] == pytest.approx(20.0)
    assert adr.iloc[-1] == pytest.approx(20.0)


def test_calc_adr_absolute_matches_rupees():
    df = make_df([100.0] * 16, highs=[110.0] * 16, lows=[94.0] * 16)
    adr_abs = calc_adr_absolute(df, period=14)
    assert adr_abs.iloc[-1] == pytest.approx(16.0)  # (110-94) mean = 16


# ---------- calc_ma_angle ----------

def test_ma_angle_flat_series_is_zero():
    df = make_df([500.0] * 30)
    sma = calc_sma(df, period=20)
    angles = calc_ma_angle(sma, points=5)
    # all valid windows of a flat SMA have slope 0
    valid = angles.iloc[23:]  # sma valid from 19, angle valid from sma_idx+4
    assert (valid == 0).all()


def test_ma_angle_known_slope_rising():
    # SMA of a +2/step linear series is itself linear with slope +2
    # angle = degrees(arctan(2)) ≈ 63.4349°
    closes = [100.0 + 2.0 * i for i in range(30)]
    df = make_df(closes)
    sma = calc_sma(df, period=20)
    angles = calc_ma_angle(sma, points=5)
    assert angles.iloc[-1] == pytest.approx(math.degrees(math.atan(2.0)), rel=1e-6)


def test_ma_angle_too_short_returns_zeros():
    sma = pd.Series([10.0, 11.0, 12.0])
    angles = calc_ma_angle(sma, points=5)
    assert (angles == 0).all()
    assert list(angles.index) == list(sma.index)


# ---------- price change & high/low distances ----------

def test_price_change_1d_5d_20d():
    # 6 rows needed so pct_change(5) at the last row has a 5-row-back reference
    closes = [100.0, 110.0, 120.0, 130.0, 140.0, 150.0]
    df = make_df(closes)
    out = calc_price_change(df)
    assert out["price_change_1d"].iloc[-1] == pytest.approx(10.0 / 140.0)
    assert out["price_change_5d"].iloc[-1] == pytest.approx(50.0 / 100.0)
    # only 6 rows → 20d change is NaN
    assert np.isnan(out["price_change_20d"].iloc[-1])


def test_high_low_distances_at_extremes():
    # rising closes; last close == last high → distance_from_high == 0
    closes = [100.0, 102.0, 104.0, 106.0, 108.0]
    highs = [101.0, 103.0, 105.0, 107.0, 108.0]
    lows = [96.0, 98.0, 100.0, 102.0, 104.0]
    df = make_df(closes, highs=highs, lows=lows)
    out = calc_high_low_distances(df, period=5)
    assert out["distance_from_high"].iloc[-1] == pytest.approx(0.0)
    # distance from the trailing low of the same window > 0
    assert out["distance_from_low"].iloc[-1] == pytest.approx((108.0 - 96.0) / 96.0)


# ---------- compute_all_indicators ----------

def test_compute_all_indicators_adds_expected_columns():
    df = make_df([100.0 + i for i in range(60)])
    out = compute_all_indicators(df)
    for col in (
        "sma_20", "sma_50", "ma_angle", "adr_percent", "adr",
        "price_change_1d", "price_change_5d", "price_change_20d",
        "distance_from_high", "distance_from_low",
    ):
        assert col in out.columns, f"missing column {col}"
    # input not mutated
    assert "sma_20" not in df.columns


def test_compute_all_indicators_custom_params():
    closes = [100.0 + 2 * i for i in range(30)]
    df = make_df(closes)
    out = compute_all_indicators(df, indicator_params={"sma_period": 5})
    # with sma_period=5, "sma_20" column mirrors rolling(5) exactly
    expected = df["close"].rolling(5).mean()
    assert out["sma_20"].dropna().tolist() == expected.dropna().tolist()


def test_compute_all_indicators_empty_passthrough():
    empty = pd.DataFrame()
    out = compute_all_indicators(empty)
    assert out.empty


# ---------- filter helpers ----------

def test_check_price_range_inclusive_bounds():
    assert check_price_range(100.0) is True      # min bound inclusive
    assert check_price_range(2000.0) is True     # max bound inclusive
    assert check_price_range(99.99) is False
    assert check_price_range(2000.01) is False


def test_check_adr_threshold_inclusive():
    assert check_adr_threshold(3.0) is True
    assert check_adr_threshold(2.99) is False
    assert check_adr_threshold(8.7) is True


def test_check_liquidity_counts_qualified_days():
    # (open, close, volume) → movement = |c-o|/o
    def build(rows):
        return make_df([float(c) for _, c, _ in rows],
                       opens=[float(o) for o, _, _ in rows],
                       volumes=[v for _, _, v in rows])

    # 3 of 6 days are liquid (vol ≥ 1M and movement ≥ 5%) → True
    liquid_rows = [
        (100, 101, 100_000),   # low volume
        (100, 106, 2_000_000), # 6% movement, liquid
        (100, 94, 2_000_000),  # 6% movement, liquid
        (100, 100, 100_000),   # no movement, no volume
        (100, 107, 2_000_000), # 7% movement, liquid
        (100, 101, 100_000),
    ]
    assert check_liquidity(build(liquid_rows)) is True

    # only 1 qualifying day → False (start from the same frame, demote two days)
    rows2 = [(o, c, 100_000 if c != 106 else 2_000_000) for o, c, _ in liquid_rows]
    assert check_liquidity(build(rows2), min_liquid_days=2) is False


def test_check_liquidity_lookback_window():
    # qualifying days exist but only OUTSIDE the 30-day lookback → False
    n = 60
    opens = [100.0] * n
    closes = [100.5] * n
    volumes = [10_000] * n
    df = make_df(closes, opens=opens, volumes=volumes)
    assert check_liquidity(df, lookback_days=30) is False
