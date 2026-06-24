"""
Market Breadth Analyzer
Generates daily market breadth metrics from cached stock data.
Uses parallel loading + single-pass counting + SQLite storage.
"""

import logging
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Optional

import pandas as pd

from src.cache_manager import cache_manager
from src.indicators import compute_all_indicators
from src import db

logger = logging.getLogger(__name__)


def _load_stock_chunk(symbols: list[str]) -> dict[str, pd.DataFrame]:
    """Load and compute indicators for a chunk of symbols (module-level for pickling)."""
    result = {}
    for symbol in symbols:
        try:
            df = cache_manager.load(symbol)
            if df is not None and not df.empty:
                df = compute_all_indicators(df)
                result[symbol] = df
        except Exception:
            continue
    return result


def calculate_breadth(progress_callback=None) -> list[dict]:
    if progress_callback:
        progress_callback(5, "Loading cached stock data...")

    symbols = cache_manager.list_symbols()
    if not symbols:
        raise Exception("No cached stock data found")

    total_symbols = len(symbols)

    if progress_callback:
        progress_callback(10, f"Found {total_symbols} cached stocks")

    # --- Phase 1: Parallel loading ---
    num_workers = min(os.cpu_count() or 4, 8, total_symbols)
    chunk_size = max(1, total_symbols // max(num_workers, 1))
    chunks = [symbols[i:i + chunk_size] for i in range(0, total_symbols, chunk_size)]

    all_stocks_data = {}
    loaded = 0

    if len(chunks) <= 1:
        for ch in chunks:
            all_stocks_data.update(_load_stock_chunk(ch))
            loaded = total_symbols
            if progress_callback:
                progress_callback(25, f"Loaded {loaded} stocks with data")
    else:
        with ProcessPoolExecutor(max_workers=num_workers) as pool:
            future_map = {pool.submit(_load_stock_chunk, ch): len(ch) for ch in chunks}
            for future in as_completed(future_map):
                chunk_len = future_map[future]
                try:
                    all_stocks_data.update(future.result())
                except Exception as e:
                    logger.error(f"Load chunk failed: {e}")
                loaded += chunk_len
                if progress_callback:
                    pct = int(10 + (loaded / total_symbols) * 15)
                    progress_callback(pct, f"Loaded {loaded}/{total_symbols} stocks...")

    available = len(all_stocks_data)
    if progress_callback:
        progress_callback(25, f"Loaded {available} stocks with data")
    if available == 0:
        raise Exception("No valid stock data found")

    # --- Phase 2: Vectorized single-pass counting ---
    if progress_callback:
        progress_callback(30, "Counting breadth metrics...")

    all_counts = {}
    total = len(all_stocks_data)

    for idx, (symbol, df) in enumerate(all_stocks_data.items()):
        weekdays = df[df.index.dayofweek < 5].copy()
        if weekdays.empty:
            continue

        pc1 = weekdays["price_change_1d"].fillna(0)
        pc5 = weekdays["price_change_5d"].fillna(0)
        close = weekdays["close"]
        sma20 = weekdays["sma_20"]
        sma50 = weekdays["sma_50"]

        up45 = (pc1 >= 0.045).values
        down45 = (pc1 <= -0.045).values
        up20_5d = (pc5 >= 0.20).values
        down20_5d = (pc5 <= -0.20).values

        sma20_ok = sma20.notna().values
        above20 = (close >= sma20).values & sma20_ok
        below20 = (close < sma20).values & sma20_ok

        sma50_ok = sma50.notna().values
        above50 = (close >= sma50).values & sma50_ok
        below50 = (close < sma50).values & sma50_ok

        dates = weekdays.index.date

        for i, d in enumerate(dates):
            if d not in all_counts:
                all_counts[d] = [0] * 9  # [count, up45, down45, up20, down20, a20, b20, a50, b50]
            c = all_counts[d]
            c[0] += 1
            if up45[i]: c[1] += 1
            if down45[i]: c[2] += 1
            if up20_5d[i]: c[3] += 1
            if down20_5d[i]: c[4] += 1
            if above20[i]: c[5] += 1
            if below20[i]: c[6] += 1
            if above50[i]: c[7] += 1
            if below50[i]: c[8] += 1

        if (idx + 1) % 200 == 0 and progress_callback:
            pct = int(30 + ((idx + 1) / total) * 20)
            progress_callback(pct, f"Counted {idx+1}/{total} stocks...")

    del all_stocks_data

    # Filter dates with < 100 stocks
    valid_dates = {d: c for d, c in all_counts.items() if c[0] >= 100}
    sorted_dates = sorted(valid_dates.keys(), reverse=True)

    if progress_callback:
        progress_callback(50, f"Processing {len(sorted_dates)} dates...")

    # --- Phase 3: Store to SQLite ---
    db.clear_breadth()
    results = []
    total_dates = len(sorted_dates)

    for i, target_date in enumerate(sorted_dates):
        counts = valid_dates[target_date]
        date_key = target_date.strftime("%Y-%m-%d")

        c = counts  # [count, up45, down45, up20, down20, a20, b20, a50, b50]
        result = {
            "date": date_key,
            "up_4_5_pct": c[1],
            "down_4_5_pct": c[2],
            "up_20_pct_5d": c[3],
            "down_20_pct_5d": c[4],
            "above_20ma": c[5],
            "below_20ma": c[6],
            "above_50ma": c[7],
            "below_50ma": c[8],
        }
        results.append(result)

        db.upsert_breadth(
            date_key=date_key,
            up_4_5=c[1], down_4_5=c[2],
            up_20_5d=c[3], down_20_5d=c[4],
            above_20ma=c[5], below_20ma=c[6],
            above_50ma=c[7], below_50ma=c[8],
            stocks_with_data=c[0],
        )

        if progress_callback:
            pct = int(50 + ((i + 1) / total_dates) * 50)
            progress_callback(pct, f"Stored {i+1}/{total_dates} dates...")

    if progress_callback:
        progress_callback(100, f"Completed: {len(results)} dates")

    return results
