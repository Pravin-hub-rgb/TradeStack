"""
Bhavcopy Updater for TradeStack
Downloads bhavcopy data and merges it into the per-stock cache.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta, datetime
from typing import Optional

import pandas as pd

from src.nse_fetcher import download_bhavcopy, get_nse_holidays
from src.cache_manager import cache_manager

logger = logging.getLogger(__name__)

_MAX_WORKERS = 8


def _process_stock(
    symbol: str,
    target_date: date,
    row: pd.Series,
) -> tuple[str, str, str]:
    """Process a single stock: load cache, check dupe, merge + save.
    Returns (symbol, status, error_msg) where status is 'updated', 'skipped', or 'failed'.
    This runs in a thread pool worker.
    """
    try:
        stock_df = pd.DataFrame([{
            "open": row["open"],
            "high": row["high"],
            "low": row["low"],
            "close": row["close"],
            "volume": row["volume"],
        }], index=pd.to_datetime([target_date]))

        existing = cache_manager.load(symbol)
        if existing is not None and pd.Timestamp(target_date) in existing.index:
            return (symbol, "skipped", "")

        cache_manager.update_with_data(symbol, stock_df, existing=existing, commit=True)
        return (symbol, "updated", "")
    except Exception as e:
        err = str(e)
        logger.warning("Failed to update %s: %s", symbol, err)
        return (symbol, "failed", err)


def update_cache_for_date(
    target_date: date,
    batch_size: int = 100,
    progress_callback: Optional[callable] = None,
) -> dict:
    """
    Download bhavcopy for target_date and update all cached stocks.
    Uses hash-indexed lookups and parallel thread pool for speed.

    Returns stats dict with counts of updated/skipped/failed/not_found.
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

    # Build hash index for O(1) symbol lookups
    bhavcopy_indexed = bhavcopy.set_index("symbol")

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

    # Build work items: only symbols that are in bhavcopy data
    work_items = []
    for symbol in symbols:
        if symbol in bhavcopy_indexed.index:
            work_items.append((symbol, bhavcopy_indexed.loc[symbol]))
        else:
            stats["not_in_bhavcopy"] += 1

    total = len(work_items)
    if total == 0:
        stats["duration_sec"] = round((datetime.now() - start).total_seconds(), 1)
        if progress_callback:
            progress_callback(100, f"No matching stocks in bhavcopy — {stats['not_in_bhavcopy']} not found")
        return stats

    processed = 0
    # Process in batches for progress reporting and periodic commits
    for batch_start in range(0, total, batch_size):
        batch = work_items[batch_start:batch_start + batch_size]
        batch_results = {"updated": 0, "skipped": 0, "failed": 0}

        with ThreadPoolExecutor(max_workers=min(_MAX_WORKERS, len(batch))) as pool:
            futures = {
                pool.submit(_process_stock, symbol, target_date, row): symbol
                for symbol, row in batch
            }
            for future in as_completed(futures):
                sym, status, err = future.result()
                batch_results[status] += 1
                if status == "failed" and progress_callback:
                    progress_callback(None, None, log_entry=f"Failed {sym}: {err}")

        stats["updated"] += batch_results["updated"]
        stats["skipped"] += batch_results["skipped"]
        stats["failed"] += batch_results["failed"]
        processed += len(batch)

        pct = round(processed / total * 100, 1)
        msg = f"{processed}/{total} stocks — {stats['updated']} updated, {stats['skipped']} skipped"
        logger.info("Progress: %s (%s%%)", msg, pct)
        if progress_callback:
            progress_callback(pct, msg)

    stats["duration_sec"] = round((datetime.now() - start).total_seconds(), 1)
    stats["success_rate"] = round(stats["updated"] / max(stats["total_cached_stocks"], 1) * 100, 1)
    logger.info(
        "Update for %s: %s updated, %s skipped, %s failed",
        target_date, stats["updated"], stats["skipped"], stats["failed"],
    )
    if progress_callback:
        summary = f"Done — {stats['updated']} updated, {stats['skipped']} skipped"
        if stats["failed"]:
            summary += f", {stats['failed']} failed"
        progress_callback(100, summary)
    return stats


def find_cache_gaps() -> list[date]:
    """
    Find trading days between latest cache date and today that are missing.
    Skips weekends and NSE trading holidays.
    Returns sorted list of missing dates.
    """
    latest = cache_manager.get_latest_cache_date()
    if latest is None:
        return []

    holidays = get_nse_holidays()

    gaps = []
    current = latest + timedelta(days=1)
    today = date.today()

    while current < today:
        if current.weekday() < 5 and current not in holidays:
            gaps.append(current)
        current += timedelta(days=1)

    return gaps


def fill_cache_gaps(batch_size: int = 100, progress_callback: Optional[callable] = None) -> list[dict]:
    """
    Download bhavcopy for all missing dates and update cache.
    Returns list of per-date stats dicts.
    """
    gaps = find_cache_gaps()
    if not gaps:
        logger.info("No gaps found — cache is up to date")
        if progress_callback:
            progress_callback(100, "No gaps found — cache is up to date")
        return []

    logger.info("Found %s gap date(s): %s to %s", len(gaps), gaps[0], gaps[-1])
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
            logger.info("  %s", msg)
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
