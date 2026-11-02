"""
Corporate actions + gap audit helpers for TradeStack.

Uses Upstox Corporate Actions API to fetch verified splits/bonuses/rights/dividends
for a symbol, and detects date gaps in the cached bhavcopy data.
"""
import json
import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import requests

from . import db
from .upstox_fetcher import get_instrument_key

logger = logging.getLogger(__name__)

UPSTOX_CA_URL = "https://api.upstox.com/v2/fundamentals/{isin}/corporate-actions"


def _get_isin(symbol: str) -> Optional[str]:
    """Resolve symbol -> ISIN. Upstox instrument master stores ISIN in 'isin' field."""
    from pathlib import Path
    import gzip
    master = Path(__file__).resolve().parent.parent.parent / "data" / "NSE.json.gz"
    if not master.exists():
        return None
    try:
        with gzip.open(str(master), "rt", encoding="utf-8") as f:
            data = json.load(f)
        for d in data:
            if d.get("segment") == "NSE_EQ" and d.get("instrument_type") == "EQ" and d.get("trading_symbol", "").upper() == symbol.upper():
                return d.get("isin")
    except Exception as e:
        logger.warning(f"ISIN lookup failed for {symbol}: {e}")
    return None


def fetch_upstox_corporate_actions(symbol: str, token: str) -> list[dict]:
    """Fetch corporate actions for a symbol from Upstox. Returns list of action dicts."""
    isin = _get_isin(symbol)
    if not isin:
        return []
    url = UPSTOX_CA_URL.format(isin=isin)
    headers = {"Accept": "application/json", "Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "success":
            return []
        return data.get("data", []) or []
    except Exception as e:
        logger.warning(f"Corporate actions fetch failed for {symbol}: {e}")
        return []


def detect_gaps(symbol: str) -> list[dict]:
    """Detect date gaps in cached data for a symbol. Returns list of {start, end, missing_days, trading_days_missing}."""
    from .cache_manager import cache_manager
    df = cache_manager.load(symbol)
    if df is None or df.empty:
        return []
    idx = pd.to_datetime(df.index).sort_values()
    gaps = []
    for i in range(1, len(idx)):
        prev = idx[i - 1].date()
        cur = idx[i].date()
        delta = (cur - prev).days
        if delta > 4:  # more than a long weekend
            # count trading days missing (weekdays excluding the endpoints)
            missing = 0
            d = prev + timedelta(days=1)
            while d < cur:
                if d.weekday() < 5:
                    missing += 1
                d += timedelta(days=1)
            gaps.append({
                "from": prev.isoformat(),
                "to": cur.isoformat(),
                "calendar_days": delta,
                "trading_days_missing": missing,
            })
    return gaps


def audit_stock(symbol: str, token: Optional[str] = None) -> dict:
    """Build an audit report for a symbol: gaps + corporate actions + explanation."""
    from .cache_manager import cache_manager
    symbol = symbol.upper()
    df = cache_manager.load(symbol)
    if df is None or df.empty:
        return {"symbol": symbol, "error": "No cached data for this symbol"}

    first = df.index.min().date().isoformat() if hasattr(df.index.min(), "date") else str(df.index.min())
    last = df.index.max().date().isoformat() if hasattr(df.index.max(), "date") else str(df.index.max())
    rows = len(df)

    gaps = detect_gaps(symbol)

    actions = []
    if token:
        raw = fetch_upstox_corporate_actions(symbol, token)
        for a in raw:
            actions.append({
                "type": a.get("name"),
                "ex_date": a.get("expiry_date"),
                "ratio": a.get("ratio"),
                "amount": a.get("amount"),
                "details": a.get("event_details", []),
            })

    # Build explanation
    explanations = []
    if not gaps and not actions:
        explanations.append("No gaps or corporate actions detected. Data looks continuous.")
    for g in gaps:
        if g["trading_days_missing"] >= 10:
            explanations.append(
                f"Large gap {g['from']} -> {g['to']} ({g['trading_days_missing']} trading days missing). "
                "Likely a trading halt (demerger/merger/suspension) — no bhavcopy rows exist for those dates. "
                "This is real (not missing data)."
            )
        else:
            explanations.append(
                f"Small gap {g['from']} -> {g['to']} ({g['trading_days_missing']} trading days). "
                "Likely a holiday/weekend stretch or halted session."
            )
    for a in actions:
        t = (a.get("type") or "").lower()
        if "bonus" in t or "split" in t:
            explanations.append(
                f"Corporate action: {a['type']} {a.get('ratio') or ''} ex {a['ex_date']}. "
                "Upstox back-adjusts historical prices for this (continuous chart). "
                "Raw bhavcopy shows the drop."
            )
        elif "dividend" in t:
            explanations.append(
                f"Corporate action: {a['type']} Rs {a.get('amount')} ex {a['ex_date']}. "
                "Dividend causes a small price drop on ex-date (not adjusted by default)."
            )
        elif "rights" in t:
            explanations.append(
                f"Corporate action: Rights issue ex {a['ex_date']}. May cause price adjustment."
            )
        else:
            explanations.append(f"Corporate action: {a['type']} ex {a['ex_date']}.")

    if gaps and not actions:
        explanations.append(
            "Gaps present but no corporate actions in Upstox registry. "
            "If the gap is large, check NSE/BSE for demerger/merger/suspension manually."
        )

    return {
        "symbol": symbol,
        "first_date": first,
        "last_date": last,
        "row_count": rows,
        "gaps": gaps,
        "corporate_actions": actions,
        "explanations": explanations,
    }
