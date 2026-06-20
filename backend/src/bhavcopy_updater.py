"""
Bhavcopy Updater for TradeStack
Downloads bhavcopy data and merges it into the per-stock cache.
"""

import logging
from datetime import date, timedelta, datetime
from typing import Optional

import pandas as pd

from src.nse_fetcher import download_bhavcopy
from src.cache_manager import cache_manager

logger = logging.getLogger(__name__)


def update_cache_for_date(
    target_date: date,
    batch_size: int = 100,
    progress_callback: Optional[callable] = None,
) -> dict:
    """
    Download bhavcopy for target_date and update all cached stocks.
    Returns stats dict with counts of updated/skipped/failed/not_found.
    If progress_callback is provided, calls it as callback(pct, message, log_entry=None).
    """
    start = datetime.now()
    stats = {"date": target_date.isoformat(), "updated": 0, "skipped": 0, "failed": 0, "not_in_bhavcopy": 0}

    bhavcopy = download_bhavcopy(target_date)
    if bhavcopy is None or bhavcopy.empty:
        stats["error"] = "No bhavcopy data available"
        stats["duration_sec"] = (datetime.now() - start).total_seconds()
        if progress_callback:
            progress_callback(100, "Failed — no bhavcopy data")
        return stats

    symbols = cache_manager.list_symbols()
    if not symbols:
        stats["error"] = "No cached stocks to update"
        stats["duration_sec"] = (datetime.now() - start).total_seconds()
        if progress_callback:
            progress_callback(100, "No cached stocks to update")
        return stats

    stats["total_cached_stocks"] = len(symbols)
    stats["bhavcopy_stocks"] = len(bhavcopy)

    if progress_callback:
        progress_callback(0, f"Starting update for {target_date} — {len(symbols)} stocks")

    for i, symbol in enumerate(symbols):
        try:
            log_line = f"Checking cache for {symbol}"
            if i % 10 == 0 and progress_callback:
                progress_callback(None, None, log_entry=log_line)

            match = bhavcopy[bhavcopy["symbol"] == symbol]
            if match.empty:
                stats["not_in_bhavcopy"] += 1
                continue

            row = match.iloc[0]
            stock_df = pd.DataFrame([{
                "open": row["open"],
                "high": row["high"],
                "low": row["low"],
                "close": row["close"],
                "volume": row["volume"],
            }], index=pd.to_datetime([target_date]))

            existing = cache_manager.load(symbol)
            if existing is not None:
                log_line = f"Loaded cached data for {symbol}: {len(existing)} days"
                if i % 5 == 0 and progress_callback:
                    progress_callback(None, None, log_entry=log_line)

            if existing is not None and pd.Timestamp(target_date) in existing.index:
                stats["skipped"] += 1
                continue

            cache_manager.update(symbol, stock_df)
            stats["updated"] += 1
            log_line = f"Updated cache for {symbol}: {target_date}"
            logger.info(log_line)
            if progress_callback:
                progress_callback(None, None, log_entry=log_line)

        except Exception as e:
            log_line = f"Failed to update {symbol}: {e}"
            logger.warning(log_line)
            stats["failed"] += 1
            if progress_callback:
                progress_callback(None, None, log_entry=log_line)

        if (i + 1) % 10 == 0 or (i + 1) == len(symbols):
            pct = round((i + 1) / len(symbols) * 100, 1)
            msg = f"{i+1}/{len(symbols)} — {stats['updated']} updated, {stats['skipped']} skipped"
            logger.info(f"Progress: {msg} ({pct}%)")
            if progress_callback:
                progress_callback(pct, msg)

    stats["duration_sec"] = round((datetime.now() - start).total_seconds(), 1)
    stats["success_rate"] = round(stats["updated"] / max(stats["total_cached_stocks"], 1) * 100, 1)
    logger.info(f"Update for {target_date}: {stats['updated']} updated, {stats['skipped']} skipped, {stats['failed']} failed")
    if progress_callback:
        progress_callback(100, f"Done — {stats['updated']} updated, {stats['success_rate']}% success")
    return stats


def find_cache_gaps() -> list[date]:
    """
    Find trading days between latest cache date and today that are missing.
    Returns sorted list of missing dates.
    """
    latest = cache_manager.get_latest_cache_date()
    if latest is None:
        return []

    gaps = []
    current = latest + timedelta(days=1)
    today = date.today()

    while current < today:
        if current.weekday() < 5:
            gaps.append(current)
        current += timedelta(days=1)

    return gaps


def fill_cache_gaps(batch_size: int = 100, progress_callback: Optional[callable] = None) -> list[dict]:
    """
    Download bhavcopy for all missing dates and update cache.
    Returns list of per-date stats dicts.
    If progress_callback is provided, calls it between dates.
    """
    gaps = find_cache_gaps()
    if not gaps:
        logger.info("No gaps found — cache is up to date")
        if progress_callback:
            progress_callback(100, "No gaps found — cache is up to date")
        return []

    logger.info(f"Found {len(gaps)} gap date(s): {gaps[0]} to {gaps[-1]}")
    if progress_callback:
        progress_callback(0, f"Found {len(gaps)} gap(s): {gaps[0]} to {gaps[-1]}")

    results = []

    for i, gap_date in enumerate(gaps):
        pct = round(i / len(gaps) * 100, 1)
        if progress_callback:
            progress_callback(pct, f"Downloading bhavcopy for {gap_date}...", log_entry=f"Processing {gap_date} ({i+1}/{len(gaps)})")

        result = update_cache_for_date(gap_date, batch_size=batch_size, progress_callback=progress_callback)
        results.append(result)
        if "error" not in result:
            msg = f"Filled {gap_date}: {result['updated']} stocks updated"
            logger.info(f"  {msg}")
            if progress_callback:
                progress_callback(None, None, log_entry=msg)

    if progress_callback:
        progress_callback(100, f"Done — filled {len(results)} date(s)")

    return results


def get_cache_dates() -> list[str]:
    """
    Return sorted list of all unique dates present across all cached stocks.
    """
    all_dates: set = set()
    for symbol in cache_manager.list_symbols():
        data = cache_manager.load(symbol)
        if data is not None and not data.empty:
            for idx in data.index:
                all_dates.add(idx.date().isoformat())
    return sorted(all_dates)
