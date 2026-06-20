"""
Technical Indicators for TradeStack
Pure functions that take OHLCV DataFrames and return computed values.
Maps exactly to the old codebase's data_fetcher.py + filters.py calculations.
"""

from typing import Optional

import numpy as np
import pandas as pd


def calc_sma(data: pd.DataFrame, period: int = 20) -> pd.Series:
    """Simple Moving Average of close price."""
    if data.empty:
        return pd.Series(dtype=float)
    return data["close"].rolling(window=period).mean()


def calc_adr(data: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average Daily Range as percentage of close price."""
    if data.empty:
        return pd.Series(dtype=float)
    daily_range = data["high"] - data["low"]
    adr_abs = daily_range.rolling(window=period).mean()
    return (adr_abs / data["close"]) * 100


def calc_adr_absolute(data: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average Daily Range in absolute Rupees."""
    if data.empty:
        return pd.Series(dtype=float)
    daily_range = data["high"] - data["low"]
    return daily_range.rolling(window=period).mean()


def calc_ma_angle(ma_series: pd.Series, points: int = 5) -> pd.Series:
    """Moving Average angle/slope using linear regression over last N points."""
    angles = []
    for i in range(len(ma_series)):
        if i < points - 1:
            angles.append(0.0)
            continue
        start = i - points + 1
        recent = ma_series.iloc[start : i + 1]
        if recent.isna().any():
            angles.append(0.0)
            continue
        slope = np.polyfit(np.arange(points), recent.values, 1)[0]
        angles.append(float(np.degrees(np.arctan(slope))))
    return pd.Series(angles, index=ma_series.index)


def calc_price_change(data: pd.DataFrame, periods: list[int] = None) -> pd.DataFrame:
    """Percentage price change over 1, 5, and 20-day periods."""
    if periods is None:
        periods = [1, 5, 20]
    result = pd.DataFrame(index=data.index)
    for p in periods:
        result[f"price_change_{p}d"] = data["close"].pct_change(p)
    return result


def calc_high_low_distances(data: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Distance of close from period high/low as fraction."""
    result = pd.DataFrame(index=data.index)
    high_period = data["high"].rolling(window=period).max()
    low_period = data["low"].rolling(window=period).min()
    result["distance_from_high"] = (data["close"] - high_period) / high_period
    result["distance_from_low"] = (data["close"] - low_period) / low_period
    return result


def compute_all_indicators(data: pd.DataFrame, indicator_params: Optional[dict] = None) -> pd.DataFrame:
    """Compute all technical indicators and return DataFrame with added columns.
    
    Args:
        data: OHLCV DataFrame
        indicator_params: Optional dict with keys like sma_period, adr_period,
                         price_change_periods, high_low_period, ma_angle_points.
                         Falls back to hardcoded defaults if not provided.
    """
    if data.empty:
        return data
    p = indicator_params or {}
    sma_period = p.get("sma_period", 20)
    adr_period = p.get("adr_period", 14)
    price_change_periods = p.get("price_change_periods", [1, 5, 20])
    high_low_period = p.get("high_low_period", 20)
    ma_angle_points = p.get("ma_angle_points", 5)

    df = data.copy()
    df["sma_20"] = calc_sma(df, period=sma_period)
    df["ma_angle"] = calc_ma_angle(df["sma_20"], points=ma_angle_points)
    df["adr_percent"] = calc_adr(df, period=adr_period)
    df["adr"] = calc_adr_absolute(df, period=adr_period)
    changes = calc_price_change(df, periods=price_change_periods)
    for col in changes.columns:
        df[col] = changes[col]
    distances = calc_high_low_distances(df, period=high_low_period)
    for col in distances.columns:
        df[col] = distances[col]
    return df


def check_price_range(
    close: float, min_price: float = 100.0, max_price: float = 2000.0
) -> bool:
    """Check if close price is within the acceptable range."""
    return min_price <= close <= max_price


def check_adr_threshold(adr_percent: float, min_adr: float = 3.0) -> bool:
    """Check if ADR% meets minimum threshold."""
    return adr_percent >= min_adr


def check_liquidity(
    data: pd.DataFrame,
    volume_threshold: int = 1_000_000,
    movement_threshold_pct: float = 0.05,
    min_liquid_days: int = 2,
    lookback_days: int = 30,
) -> bool:
    """Check if stock has sufficient liquid days (high vol + price movement)."""
    if data.empty or len(data) < min_liquid_days:
        return False
    recent = data.tail(lookback_days)
    movements = abs(recent["close"] - recent["open"]) / recent["open"]
    liquid_days = (recent["volume"] >= volume_threshold) & (movements >= movement_threshold_pct)
    return int(liquid_days.sum()) >= min_liquid_days



