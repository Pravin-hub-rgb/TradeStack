"""
Live Volume Fetcher for TradeStack
Fetches today's cumulative volume from Upstox market-quote LTP API.
Used at entry time to validate volume against 10-day baseline (SVRO check).
Mirrors old project's upstox_fetcher.get_current_volume().
"""

import logging
from typing import Optional

import requests

from .upstox_fetcher import get_instrument_key

logger = logging.getLogger(__name__)


class VolumeFetcher:
    """Fetches current day's cumulative volume for symbols from Upstox LTP API."""

    def fetch_current_volume(self, symbol: str, token: str) -> float:
        """
        Get today's cumulative volume for a single symbol.

        Args:
            symbol: Stock symbol (e.g. "RELIANCE")
            token: Upstox access token

        Returns:
            Today's cumulative volume as float, or 0 on failure
        """
        try:
            instrument_key = get_instrument_key(symbol)
            if not instrument_key:
                logger.error(f"No instrument key found for {symbol}")
                return 0.0

            url = f"https://api.upstox.com/v3/market-quote/ltp?instrument_key={instrument_key}"
            headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
            }

            resp = requests.get(url, headers=headers, timeout=10)

            if resp.status_code != 200:
                logger.error(f"Volume fetch error for {symbol}: {resp.status_code}")
                return 0.0

            data = resp.json()
            if data.get("status") != "success":
                logger.error(f"Volume API error for {symbol}: {data}")
                return 0.0

            data_dict = data.get("data", {})

            # Try exact instrument key first, then NSE_EQ:SYMBOL format
            instrument_data = data_dict.get(instrument_key)
            if not instrument_data:
                alt_key = f"NSE_EQ:{symbol.upper()}"
                instrument_data = data_dict.get(alt_key)

            if not instrument_data:
                logger.error(f"No data for {symbol} in volume response")
                return 0.0

            volume = instrument_data.get("volume", 0)
            return float(volume)

        except Exception as e:
            logger.error(f"Error getting current volume for {symbol}: {e}")
            return 0.0


volume_fetcher = VolumeFetcher()
