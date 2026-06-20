"""
Upstox Historical Data Fetcher for TradeStack
Downloads 180 calendar days (~120 trading days) of EOD data for all NSE stocks.
Uses direct HTTP requests (no SDK dependency).

Flow:
  upstox_fetcher.fetch_all_stocks(token, progress_callback)
    → for each symbol:
        get_instrument_key(symbol) from complete.csv.gz
        fetch_historical_data(symbol, token, days=180)
        cache_manager.update(symbol, df)
    → progress_callback(pct, msg, log_entry)
"""

import gzip
import logging
import time
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional, Callable

import pandas as pd
import requests

from . import db

logger = logging.getLogger(__name__)

# Path to instrument master file (from Upstox)
MASTER_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "complete.csv.gz"

# Manual overrides for problem stocks (same as old project)
MANUAL_MAPPINGS = {
    "CHOLAFIN": "NSE_EQ|INE121A01024",
    "ANURAS": "NSE_EQ|INE930P01018",
}

_instrument_cache: dict[str, str] | None = None


def _load_instruments() -> dict[str, str]:
    """Load instrument key mapping from complete.csv.gz."""
    global _instrument_cache
    if _instrument_cache is not None:
        return _instrument_cache

    if not MASTER_FILE.exists():
        logger.error(f"Instrument master file not found: {MASTER_FILE}")
        _instrument_cache = {}
        return _instrument_cache

    try:
        with gzip.open(str(MASTER_FILE), "rt", encoding="utf-8") as f:
            df = pd.read_csv(f)
        nse_eq = df[df["exchange"] == "NSE_EQ"]
        _instrument_cache = dict(zip(nse_eq["tradingsymbol"], nse_eq["instrument_key"]))
        logger.info(f"Loaded {len(_instrument_cache)} instrument mappings")
    except Exception as e:
        logger.error(f"Failed to load instrument mapping: {e}")
        _instrument_cache = {}

    return _instrument_cache


def get_instrument_key(symbol: str) -> str | None:
    """Convert NSE symbol to Upstox instrument key."""
    sym = symbol.upper()
    if sym in MANUAL_MAPPINGS:
        return MANUAL_MAPPINGS[sym]
    mapping = _load_instruments()
    if sym in mapping:
        return mapping[sym]
    logger.warning(f"No instrument key for {sym}")
    return None


def instrument_keys_loaded() -> int:
    """Return count of loaded instrument keys, or 0."""
    return len(_load_instruments())


def _build_url(instrument_key: str, from_date: str, to_date: str) -> str:
    """Build the Upstox historical candle API URL."""
    import urllib.parse
    key_encoded = urllib.parse.quote(instrument_key, safe="")
    return f"https://api.upstox.com/v2/historical-candle/{key_encoded}/day/{to_date}/{from_date}"


def fetch_historical_data(
    symbol: str,
    token: str,
    days: int = 180,
) -> pd.DataFrame:
    """
    Download historical EOD data for one stock via Upstox API.
    Returns DataFrame with ['open','high','low','close','volume','oi'], indexed by date.
    Returns empty DataFrame on failure.
    """
    instrument_key = get_instrument_key(symbol)
    if not instrument_key:
        return pd.DataFrame()

    end = date.today()
    start = end - timedelta(days=days)

    url = _build_url(instrument_key, start.isoformat(), end.isoformat())
    headers = {"Accept": "application/json", "Authorization": f"Bearer {token}"}

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning(f"HTTP error for {symbol}: {e}")
        return pd.DataFrame()

    if data.get("status") != "success":
        return pd.DataFrame()

    candles = data.get("data", {}).get("candles", [])
    if not candles:
        return pd.DataFrame()

    rows = []
    for c in candles:
        ts = c[0][:10]  # "2026-06-08T00:00:00+05:30" → "2026-06-08"
        rows.append({
            "date": ts,
            "open": float(c[1]),
            "high": float(c[2]),
            "low": float(c[3]),
            "close": float(c[4]),
            "volume": int(c[5]),
            "oi": int(c[6]),
        })

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df.set_index("date", inplace=True)
    df.sort_index(inplace=True)
    return df


def get_nse_stocks() -> list[dict]:
    """Fetch the list of NSE stocks from the instrument mapping."""
    mapping = _load_instruments()
    return [{"symbol": sym} for sym in sorted(mapping.keys())]


def fetch_all_stocks(
    token: str,
    days: int = 180,
    progress_callback: Optional[Callable] = None,
):
    """
    Download historical data for ALL NSE stocks.
    Calls cache_manager.update() for each successful download.

    progress_callback signature: fn(pct: float, msg: str, log_entry: str)
    """
    from .cache_manager import cache_manager

    mapping = _load_instruments()
    symbols = sorted(mapping.keys())
    total = len(symbols)

    if progress_callback:
        progress_callback(0, f"Downloading historical data for {total} stocks...", f"Starting download of {total} stocks, {days} calendar days each")

    updated = 0
    skipped = 0
    failed = 0

    for i, symbol in enumerate(symbols, 1):
        try:
            df = fetch_historical_data(symbol, token, days=days)

            if df.empty:
                failed += 1
                if progress_callback and i % 50 == 0:
                    progress_callback(
                        round(i / total * 100, 1),
                        f"{i}/{total} — {updated} updated, {skipped} skipped, {failed} failed",
                        None,
                    )
                continue

            cache_manager.update(symbol, df)
            updated += 1

            if progress_callback:
                if i % 10 == 0 or i == total:
                    pct = round(i / total * 100, 1)
                    progress_callback(
                        pct,
                        f"{i}/{total} — {updated} updated, {skipped} skipped, {failed} failed",
                        f"Downloaded {symbol}: {len(df)} days ({updated}/{total})",
                    )

        except Exception as e:
            failed += 1
            logger.error(f"Error downloading {symbol}: {e}")

    if progress_callback:
        progress_callback(
            100,
            f"Done — {updated} updated, {skipped} skipped, {failed} failed",
            f"Historical download complete: {updated} stocks updated, {failed} failed",
        )

    return {"updated": updated, "skipped": skipped, "failed": failed, "total": total}
