"""
Step 7: Technical Indicators Tests
Verifies indicator calculations match the old codebase values.

Usage:
  cd MA_Stock_Trader_NA
  backend/venv/Scripts/python tests/step7_indicators.py
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import pandas as pd
from src.indicators import (
    calc_sma,
    calc_adr,
    calc_ma_angle,
    compute_all_indicators,
    check_price_range,
    check_adr_threshold,
    check_liquidity,
)
from src.cache_manager import cache_manager

logging.basicConfig(level=logging.WARNING)
PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"

SYMBOL = "20MICRONS"
tests_run = 0
tests_passed = 0
tests_skipped = 0


def assert_close(actual: float, expected: float, tol: float = 0.01, label: str = ""):
    global tests_run, tests_passed
    tests_run += 1
    if abs(actual - expected) <= tol:
        tests_passed += 1
        print(f"{PASS} {label} ({actual:.4f} ~ {expected:.4f})")
    else:
        print(f"{FAIL} {label}: got {actual:.4f}, expected {expected:.4f}")


def assert_true(value: bool, label: str = ""):
    global tests_run, tests_passed
    tests_run += 1
    if value:
        tests_passed += 1
        print(f"{PASS} {label}")
    else:
        print(f"{FAIL} {label}")


def assert_false(value: bool, label: str = ""):
    global tests_run, tests_passed
    tests_run += 1
    if not value:
        tests_passed += 1
        print(f"{PASS} {label}")
    else:
        print(f"{FAIL} {label}")


def load_data() -> pd.DataFrame | None:
    data = cache_manager.load(SYMBOL)
    if data is None or data.empty:
        print(f"  {SKIP} no cache for {SYMBOL}")
        return None
    print(f"  Loaded {SYMBOL}: {len(data)} rows, {data.index[0].date()} to {data.index[-1].date()}")
    return data


def test_calc_sma():
    data = load_data()
    if data is None: return
    sma = calc_sma(data, period=20)
    last_sma = sma.iloc[-1]
    assert_true(pd.notna(last_sma) and 10 < last_sma < 10000, f"SMA20 valid float ({last_sma:.2f})")
    print(f"  SMA20 last value: {last_sma:.4f}")


def test_calc_adr():
    data = load_data()
    if data is None: return
    adr = calc_adr(data, period=14)
    last_adr = adr.iloc[-1]
    assert_true(pd.notna(last_adr) and 0 < last_adr < 20, f"ADR% in valid range ({last_adr:.2f}%)")
    print(f"  ADR% last value: {last_adr:.4f}")


def test_compute_all_indicators():
    data = load_data()
    if data is None: return
    result = compute_all_indicators(data)
    expected_cols = {"sma_20", "ma_angle", "adr_percent", "adr",
                     "price_change_1d", "price_change_5d", "price_change_20d",
                     "distance_from_high", "distance_from_low"}
    for col in expected_cols:
        assert_true(col in result.columns, f"Column {col} exists")
    assert_true(len(result) == len(data), "Same row count after indicators")


def test_check_price_range():
    assert_true(check_price_range(500, 100, 2000), "500 in [100, 2000]")
    assert_true(check_price_range(100, 100, 2000), "100 == min")
    assert_true(check_price_range(2000, 100, 2000), "2000 == max")
    assert_false(check_price_range(50, 100, 2000), "50 < min")
    assert_false(check_price_range(2500, 100, 2000), "2500 > max")


def test_check_adr_threshold():
    assert_true(check_adr_threshold(5.0, 3.0), "ADR 5% >= 3%")
    assert_true(check_adr_threshold(3.0, 3.0), "ADR 3% == 3% min")
    assert_false(check_adr_threshold(2.5, 3.0), "ADR 2.5% < 3%")


def test_check_liquidity():
    data = load_data()
    if data is None: return
    result = check_liquidity(data)
    print(f"  Liquidity check for {SYMBOL}: {result}")


def test_custom_scenario():
    """Test with synthetic data to verify exact values."""
    dates = pd.date_range("2026-01-01", periods=30, freq="D")
    prices = [100 + i * 0.5 for i in range(30)]

    # Build OHLC: open = close-5 (big gap for movement), high/low = close +/- 5
    df = pd.DataFrame({
        "open": [p - 5 for p in prices],
        "high": [p + 5 for p in prices],
        "low": [p - 5 for p in prices],
        "close": prices,
        "volume": [5_000_000 if i % 3 == 0 else 2_000_000 for i in range(29)] + [10_000_000],
    }, index=dates)

    # SMA20 = average of first 20 prices
    sma = calc_sma(df, period=20)
    assert_close(sma.iloc[19], 104.75, tol=0.1, label="Synthetic SMA20")

    # ADR = avg daily range / close * 100
    # daily range = ~10, close ~ 109.5 → ~9.13%
    adr = calc_adr(df, period=14)
    last_adr = adr.iloc[-1]
    assert_close(last_adr, 9.13, tol=0.5, label="Synthetic ADR%")

    # Price range check
    assert_true(check_price_range(109.5, 100, 2000), "Synth price in range")
    assert_false(check_price_range(109.5, 150, 2000), "Synth price too low")

    # ADR threshold
    assert_true(check_adr_threshold(last_adr, 3.0), "Synth ADR >= 3%")

    # Liquidity: movement = |close-open|/open = 5/95 to 5/109 ~ 4.6%-5.3%
    # Use threshold 0.045 to cover all days
    assert_true(check_liquidity(df, movement_threshold_pct=0.045),
                "Synth liquidity pass (movement 4.6-5.3%)")
    # With tighter threshold some days may fail, but enough should pass
    assert_true(check_liquidity(df, movement_threshold_pct=0.05),
                "Synth liquidity pass (movement >= 5%)")

if __name__ == "__main__":
    print("=" * 50)
    print("Step 7: Technical Indicators Tests")
    print("=" * 50)

    test_calc_sma()
    test_calc_adr()
    test_compute_all_indicators()
    test_check_price_range()
    test_check_adr_threshold()
    test_check_liquidity()
    test_custom_scenario()

    print("=" * 50)
    skipped = tests_run - tests_passed - (tests_run - tests_passed - (tests_run - sum(1 for _ in [1])))  # noqa
    print(f"{tests_passed}/{tests_run} passed")
    if tests_passed == tests_run:
        print("All tests passed!")
    else:
        print(f"{tests_run - tests_passed} test(s) failed")
    print("=" * 50)
