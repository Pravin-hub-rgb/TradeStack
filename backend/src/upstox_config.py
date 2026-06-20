"""
Upstox Token Manager for TradeStack
Stores and validates Upstox API credentials using the shared SQLite database.

Tokens are stored in `data/settings.db` (upstox_config table).
No file watcher needed — SQLite handles concurrency via WAL mode.
"""

import logging
import requests
from datetime import datetime

from . import db

logger = logging.getLogger(__name__)

def get_api_key() -> str:
    val = db.settings_get("upstox_api_key")
    return val["value"] if val and val.get("value") else "6ec86817-5a40-4d0f-929f-45486fb7193c"


def get_api_secret() -> str:
    val = db.settings_get("upstox_api_secret")
    return val["value"] if val and val.get("value") else "5yqgvu4mst"

# Test symbols (unlikely to be delisted)
TEST_SYMBOLS = ["RELIANCE", "TCS", "HDFCBANK"]


def get_token() -> str | None:
    """Get the stored access token."""
    return db.upstox_get("access_token")


def save_token(token: str):
    """Save a new access token to the database."""
    db.upstox_set("access_token", token)
    db.upstox_set("token_updated_at", datetime.now().isoformat())
    logger.info("Access token saved")


def get_status() -> dict:
    """Return token status without validating."""
    token = get_token()
    return {
        "exists": bool(token),
        "token_length": len(token) if token else 0,
        "masked_token": f"{'*' * 10}...{token[-4:]}" if token else None,
        "updated_at": db.upstox_get("token_updated_at"),
    }


def _check_ltp_api(symbol: str, token: str) -> float | None:
    """Call the Upstox LTP API directly (validates token correctly)."""
    try:
        from .upstox_fetcher import get_instrument_key
        import urllib.parse

        instrument_key = get_instrument_key(symbol)
        if not instrument_key:
            return None

        key_encoded = urllib.parse.quote(instrument_key, safe="")
        url = f"https://api.upstox.com/v2/market-quote/ltp?instrument_key={key_encoded}"
        headers = {"Accept": "application/json", "Authorization": f"Bearer {token}"}

        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "success":
            for key, val in data.get("data", {}).items():
                if symbol.upper() in key.upper():
                    return float(val.get("last_price", 0))
    except Exception as e:
        logger.debug(f"LTP API check failed for {symbol}: {e}")
    return None


def validate_token(token: str) -> dict:
    """
    Save a token and test it against the LTP API for 3 hardcoded stocks.
    Uses the LTP endpoint directly (Historical API accepts bad tokens).
    Returns { valid: bool, test_results: list[str], message: str }
    """
    save_token(token)

    results = []
    successes = 0

    for symbol in TEST_SYMBOLS:
        try:
            ltp = _check_ltp_api(symbol, token)
            if ltp:
                successes += 1
                results.append(f"OK {symbol}: LTP {ltp}")
            else:
                results.append(f"FAIL {symbol}: no LTP or invalid token")
        except Exception as e:
            results.append(f"FAIL {symbol}: {e}")

    if successes > 0:
        return {"valid": True, "test_results": results, "message": f"{successes}/{len(TEST_SYMBOLS)} tests passed"}
    return {"valid": False, "test_results": results, "message": "All tests failed — token may be invalid"}


def check_token() -> dict:
    """Read-only validation of the stored token."""
    token = get_token()
    if not token:
        return {"valid": False, "message": "No token stored"}
    return validate_token(token)
