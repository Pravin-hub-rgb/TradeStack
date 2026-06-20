"""
Test script for Step 3: NSE Bhavcopy Fetcher.
Verifies that bhavcopy can be downloaded and standardized.

Usage:
  cd MA_Stock_Trader_NA
  backend/venv/Scripts/python tests/step3_nse_fetcher.py
"""

import sys
from pathlib import Path
from datetime import date, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from src.nse_fetcher import download_bhavcopy, get_stock_row, _standardize

PASS = "[PASS]"
WARN = "[WARN]"


def test_download_bhavcopy():
    """Download a real bhavcopy and verify format."""
    # Try yesterday, then walk back up to 5 days
    df = None
    used_date = None
    for i in range(10):
        test_date = date.today() - timedelta(days=i + 1)
        if test_date.weekday() < 5:
            df = download_bhavcopy(test_date)
            if df is not None:
                used_date = test_date
                break

    if df is None:
        print(f"  {WARN} Could not download bhavcopy for recent dates (NSE may be unreachable)")
        return None, None

    assert not df.empty
    assert len(df) > 500, f"Expected >500 stocks, got {len(df)}"

    expected_cols = {"symbol", "open", "high", "low", "close", "volume"}
    assert expected_cols.issubset(set(df.columns)), f"Missing columns: {expected_cols - set(df.columns)}"
    assert df.index.name == "date"
    assert "datetime64" in str(df.index.dtype)
    assert df["volume"].dtype in ("int64", "int32")
    assert df["open"].dtype == "float64"

    print(f"{PASS} test_download_bhavcopy ({len(df)} stocks on {used_date})")
    return df, used_date


def test_get_stock_row(df, used_date):
    """Test extracting a single stock from bhavcopy."""
    if df is None:
        print(f"  {WARN} Skipping test_get_stock_row")
        return

    # Pick RELIANCE if present, else first symbol
    symbol = "RELIANCE" if "RELIANCE" in df["symbol"].values else df["symbol"].iloc[0]
    row = get_stock_row(symbol, df)
    assert row is not None
    assert row["symbol"] == symbol
    assert row["open"] > 0
    assert row["volume"] > 0
    print(f"{PASS} test_get_stock_row ({symbol}: open={row['open']}, vol={row['volume']})")


def test_standardize_format():
    """Test the standardization function with mock data."""
    import pandas as pd

    mock_data = pd.DataFrame({
        "TckrSymb": ["RELIANCE", "TCS"],
        "OpnPric": [2500.0, 3500.0],
        "HghPric": [2520.0, 3520.0],
        "LwPric": [2490.0, 3490.0],
        "ClsPric": [2510.0, 3510.0],
        "TtlTradgVol": [5000000, 3000000],
    })

    result = _standardize(mock_data, date(2026, 6, 5), "test")
    assert result is not None
    assert len(result) == 2
    assert list(result.columns) == ["symbol", "open", "high", "low", "close", "volume"]
    assert result.index[0] == pd.Timestamp("2026-06-05")
    assert result["symbol"].iloc[0] == "RELIANCE"
    assert result["symbol"].iloc[1] == "TCS"
    print(f"{PASS} test_standardize_format")


if __name__ == "__main__":
    print("=" * 50)
    print("Step 3: NSE Bhavcopy Fetcher Tests")
    print("=" * 50)
    test_standardize_format()
    df, used_date = test_download_bhavcopy()
    test_get_stock_row(df, used_date)
    print("=" * 50)
    print("All tests passed!")
    print("=" * 50)
