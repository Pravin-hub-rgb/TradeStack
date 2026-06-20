"""
Volume Profile Calculator for TradeStack
Calculates Value Area High (VAH) from previous trading day's intraday data.
Used during PREP time to determine if stocks opened above/below value area.
"""

import logging
from datetime import datetime, timedelta, date
from typing import Optional

import numpy as np
import pandas as pd
import requests

from .upstox_fetcher import get_instrument_key

logger = logging.getLogger(__name__)


class VolumeProfileCalculator:
    """Calculates volume profile and VAH from 1-min OHLCV data."""

    def __init__(self, bin_size: float = 0.05, value_area_pct: float = 0.70):
        self.bin_size = bin_size
        self.value_area_pct = value_area_pct

    def get_previous_trading_day(self, token: str, current: Optional[date] = None) -> Optional[date]:
        """Walk back from current date to find last trading day with data."""
        if current is None:
            current = date.today()

        prev = current - timedelta(days=1)
        max_lookback = 10

        for _ in range(max_lookback):
            df = self._fetch_intraday("BSE", token, prev)
            if df is not None and not df.empty:
                logger.info(f"Previous trading day: {prev}")
                return prev
            prev -= timedelta(days=1)

        logger.error("No trading day found in last 10 days")
        return None

    def _fetch_intraday(self, symbol: str, token: str, target_date: date) -> Optional[pd.DataFrame]:
        """Fetch 1-min OHLCV candles for a symbol on a given date via V3 API."""
        try:
            key = get_instrument_key(symbol)
            if not key:
                logger.warning(f"No instrument key for {symbol}")
                return None

            date_str = target_date.strftime("%Y-%m-%d")
            url = (
                f"https://api.upstox.com/v3/historical-candle/{key}/minutes/1/"
                f"{date_str}/{date_str}"
            )
            headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
            }

            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code != 200:
                logger.debug(f"Intraday API error for {symbol}: {resp.status_code}")
                return None

            data = resp.json()
            if data.get("status") != "success":
                return None

            candles = data.get("data", {}).get("candles", [])
            if not candles:
                return None

            df = pd.DataFrame(
                candles,
                columns=["timestamp", "open", "high", "low", "close", "volume", "oi"],
            )
            df = df[["open", "high", "low", "close", "volume"]]
            for col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
            df = df.dropna()

            logger.debug(f"Fetched {len(df)} candles for {symbol} on {target_date}")
            return df

        except requests.RequestException as e:
            logger.debug(f"Intraday request failed for {symbol}: {e}")
            return None

    def fetch_intraday_data(self, symbol: str, token: str, target_date: date) -> Optional[pd.DataFrame]:
        """Public wrapper to fetch intraday data for a symbol."""
        return self._fetch_intraday(symbol, token, target_date)

    def calculate_volume_profile(self, ohlcv_df: pd.DataFrame) -> dict:
        """
        Calculate volume profile from OHLCV DataFrame.

        Algorithm:
          1. Create price bins at bin_size intervals across the day's range
          2. Distribute each bar's volume evenly across bins in its price range
          3. Find POC (Point of Control) = bin with highest volume
          4. Expand outward from POC to accumulate value_area_pct of total volume
          5. VAH = highest bin in value area, VAL = lowest bin

        Returns dict with keys: poc, vah, val, profile
        """
        result = {"poc": None, "vah": None, "val": None, "profile": {}}

        if ohlcv_df is None or ohlcv_df.empty or len(ohlcv_df) < 10:
            logger.warning("Insufficient data for volume profile")
            return result

        min_price = float(ohlcv_df["low"].min())
        max_price = float(ohlcv_df["high"].max())

        if min_price >= max_price:
            return result

        bins = np.arange(min_price, max_price + self.bin_size, self.bin_size)
        bin_centers = (bins[:-1] + bins[1:]) / 2
        profile = {round(float(p), 2): 0.0 for p in bin_centers}

        for _, bar in ohlcv_df.iterrows():
            bar_low = float(bar["low"])
            bar_high = float(bar["high"])
            bar_vol = float(bar["volume"])

            mask = (bins >= bar_low) & (bins <= bar_high)
            bar_bins = bins[mask]
            if len(bar_bins) <= 1:
                continue

            vol_per_bin = bar_vol / (len(bar_bins) - 1)
            for i in range(len(bar_bins) - 1):
                center = round(float((bar_bins[i] + bar_bins[i + 1]) / 2), 2)
                if center in profile:
                    profile[center] += vol_per_bin

        sorted_prices = sorted(profile.keys())
        volumes = np.array([profile[p] for p in sorted_prices])
        total_vol = volumes.sum()
        if total_vol == 0:
            return result

        poc_idx = int(np.argmax(volumes))
        poc_price = sorted_prices[poc_idx]

        acc_vol = volumes[poc_idx]
        left = poc_idx - 1
        right = poc_idx + 1
        target = total_vol * self.value_area_pct

        while acc_vol < target and (left >= 0 or right < len(volumes)):
            lv = volumes[left] if left >= 0 else 0.0
            rv = volumes[right] if right < len(volumes) else 0.0
            if lv >= rv and left >= 0:
                acc_vol += lv
                left -= 1
            elif right < len(volumes):
                acc_vol += rv
                right += 1
            else:
                break

        val_price = sorted_prices[max(0, left + 1)]
        vah_price = sorted_prices[min(len(sorted_prices) - 1, right - 1)]

        result["poc"] = round(poc_price, 2)
        result["vah"] = round(vah_price, 2)
        result["val"] = round(val_price, 2)
        result["profile"] = profile

        logger.info(f"Volume profile: POC={result['poc']}, VAH={result['vah']}, VAL={result['val']}")
        return result

    def calculate_vah_for_stocks(self, symbols: list[str], token: str) -> dict[str, float]:
        """
        Calculate VAH for each symbol using previous trading day's intraday data.

        Args:
            symbols: List of stock symbols
            token: Upstox access token

        Returns:
            {symbol: vah_price} dict
        """
        prev_day = self.get_previous_trading_day(token)
        if prev_day is None:
            logger.error("Cannot calculate VAH: no previous trading day found")
            return {}

        vah_dict: dict[str, float] = {}
        for sym in symbols:
            df = self._fetch_intraday(sym, token, prev_day)
            if df is None or df.empty:
                logger.debug(f"No intraday data for {sym} on {prev_day}")
                continue
            profile = self.calculate_volume_profile(df)
            if profile["vah"] is not None:
                vah_dict[sym] = profile["vah"]

        logger.info(f"VAH calculated for {len(vah_dict)}/{len(symbols)} stocks")
        return vah_dict


volume_profile_calculator = VolumeProfileCalculator()
