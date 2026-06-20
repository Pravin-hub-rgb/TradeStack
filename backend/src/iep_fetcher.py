"""
Pre-Market IEP Fetcher for TradeStack
Fetches Indicative Equilibrium Price (IEP) from Upstox for pre-market opening prices.
Used at PREP_START (09:14:30 IST) to set opening prices before market open (09:15).
"""

import logging
from typing import Optional

import requests

from .upstox_fetcher import get_instrument_key

logger = logging.getLogger(__name__)


class IEPFetcher:
    """Fetches IEP (opening price) for symbols from Upstox pre-market quotes."""

    def fetch_iep_batch(self, symbols: list[str], token: str) -> dict[str, float]:
        """
        Batch fetch IEP for multiple symbols.

        Args:
            symbols: Stock symbols to fetch IEP for
            token: Upstox access token

        Returns:
            {symbol: iep_price} dict
        """
        if not symbols:
            return {}

        keys: list[str] = []
        symbol_map: dict[str, str] = {}
        for sym in symbols:
            key = get_instrument_key(sym)
            if key:
                keys.append(key)
                symbol_map[key] = sym

        if not keys:
            logger.error("No valid instrument keys for IEP fetch")
            return {}

        return self._fetch_from_api(keys, symbol_map, token)

    def _fetch_from_api(
        self,
        instrument_keys: list[str],
        symbol_map: dict[str, str],
        token: str,
    ) -> dict[str, float]:
        """Call Upstox V2 quotes API and extract IEP."""
        iep_dict: dict[str, float] = {}

        try:
            url = (
                "https://api.upstox.com/v2/market-quote/quotes?"
                f"instrument_key={','.join(instrument_keys)}"
            )
            headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
            }

            resp = requests.get(url, headers=headers, timeout=10)

            if resp.status_code != 200:
                logger.error(f"IEP batch API returned {resp.status_code}")
                return self._fallback_individual(list(symbol_map.values()), token)

            try:
                data = resp.json()
            except UnicodeDecodeError:
                import json
                data = json.loads(resp.content.decode("utf-8", errors="ignore"))

            if data.get("status") != "success":
                logger.error(f"IEP API error: {data}")
                return self._fallback_individual(list(symbol_map.values()), token)

            for resp_key, quote in data.get("data", {}).items():
                symbol = (
                    quote.get("symbol")
                    or symbol_map.get(resp_key)
                    or (resp_key.split(":")[1] if ":" in resp_key else None)
                )
                if not symbol:
                    continue
                iep = quote.get("last_price") or quote.get("open")
                if iep is not None:
                    iep_dict[symbol] = float(iep)

            logger.info(f"IEP fetched for {len(iep_dict)} symbols")
            return iep_dict

        except requests.RequestException as e:
            logger.error(f"IEP batch request failed: {e}")
            return self._fallback_individual(list(symbol_map.values()), token)

    def _fallback_individual(
        self, symbols: list[str], token: str
    ) -> dict[str, float]:
        """Fallback: fetch IEP one symbol at a time."""
        logger.info("Falling back to individual IEP fetch")
        result: dict[str, float] = {}
        for sym in symbols:
            price = self.fetch_single(sym, token)
            if price is not None:
                result[sym] = price
        return result

    def fetch_single(self, symbol: str, token: str) -> Optional[float]:
        """Fetch IEP for a single symbol (individual fallback)."""
        try:
            key = get_instrument_key(symbol)
            if not key:
                return None
            url = (
                "https://api.upstox.com/v2/market-quote/quotes?"
                f"instrument_key={key}"
            )
            headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
            }
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("status") != "success":
                return None
            for _, quote in data.get("data", {}).items():
                iep = quote.get("last_price") or quote.get("open")
                if iep is not None:
                    return float(iep)
            return None
        except Exception as e:
            logger.error(f"Individual IEP fetch failed for {symbol}: {e}")
            return None


iep_fetcher = IEPFetcher()
