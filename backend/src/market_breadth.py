"""
Market Breadth Analyzer
Generates daily market breadth metrics from cached stock data
"""

import logging
import pickle
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd

from src.cache_manager import cache_manager
from src.indicators import compute_all_indicators

logger = logging.getLogger(__name__)

BREADTH_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "breadth_cache"
BREADTH_CACHE_FILE = BREADTH_CACHE_DIR / "breadth_data.pkl"


class BreadthCacheManager:
    def __init__(self):
        self.breadth_cache = self._load_cache()

    def _load_cache(self) -> Dict[str, Dict]:
        try:
            if BREADTH_CACHE_FILE.exists():
                with open(BREADTH_CACHE_FILE, "rb") as f:
                    return pickle.load(f)
        except Exception as e:
            logger.warning(f"Failed to load breadth cache: {e}")
        return {}

    def _save_cache(self):
        try:
            BREADTH_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with open(BREADTH_CACHE_FILE, "wb") as f:
                pickle.dump(self.breadth_cache, f)
        except Exception as e:
            logger.error(f"Failed to save breadth cache: {e}")

    def get_cached_breadth(self, date_key: str) -> Optional[Dict]:
        return self.breadth_cache.get(date_key)

    def update_breadth_cache(self, date_key: str, breadth_data: Dict):
        self.breadth_cache[date_key] = breadth_data
        self._save_cache()

    def get_all_cached_dates(self) -> List[str]:
        return list(self.breadth_cache.keys())

    def needs_update(self, target_date: date) -> bool:
        date_key = target_date.strftime("%Y-%m-%d")
        today = date.today()
        if (today - target_date).days <= 7:
            return True
        return date_key not in self.breadth_cache


breadth_cache = BreadthCacheManager()


def calculate_breadth(progress_callback=None) -> List[Dict]:
    if progress_callback:
        progress_callback(5, "Loading cached stock data...")

    cached_files = list(cache_manager.cache_dir.glob("*.pkl"))
    if not cached_files:
        raise Exception("No cached stock data found")

    if progress_callback:
        progress_callback(10, f"Found {len(cached_files)} cached stocks")

    all_stocks_data = {}
    total_files = len(cached_files[:2000])
    for i, cache_file in enumerate(cached_files[:2000]):
        symbol = cache_file.stem
        try:
            df = cache_manager.load(symbol)
            if df is not None and not df.empty:
                df = compute_all_indicators(df)
                all_stocks_data[symbol] = df
            if (i + 1) % 50 == 0 and progress_callback:
                pct = int(5 + ((i + 1) / total_files) * 20)
                progress_callback(pct, f"Loaded {i + 1} stocks...")
        except Exception:
            continue

    available_stocks = len(all_stocks_data)
    if progress_callback:
        progress_callback(25, f"Loaded {available_stocks} stocks with data")

    if available_stocks == 0:
        raise Exception("No valid stock data found")

    all_dates = set()
    for df in all_stocks_data.values():
        all_dates.update(df.index.date)

    weekday_dates = {d for d in all_dates if d.weekday() < 5}
    sorted_dates = sorted(weekday_dates)

    breadth_results = {}
    dates_to_calculate = []

    cached_dates = breadth_cache.get_all_cached_dates()
    if progress_callback:
        progress_callback(30, f"Found {len(cached_dates)} cached dates")

    for date_key in cached_dates:
        try:
            cached_data = breadth_cache.get_cached_breadth(date_key)
            if cached_data:
                breadth_results[date_key] = {
                    "date": date_key,
                    "up_4_5_pct": cached_data.get("up_4_5", 0),
                    "down_4_5_pct": cached_data.get("down_4_5", 0),
                    "up_20_pct_5d": cached_data.get("up_20_5d", 0),
                    "down_20_pct_5d": cached_data.get("down_20_5d", 0),
                    "above_20ma": cached_data.get("above_20ma", 0),
                    "below_20ma": cached_data.get("below_20ma", 0),
                    "above_50ma": cached_data.get("above_50ma", 0),
                    "below_50ma": cached_data.get("below_50ma", 0),
                }
        except Exception:
            continue

    if progress_callback:
        progress_callback(40, f"Loaded {len(breadth_results)} results from cache")

    for target_date in sorted_dates:
        date_key = target_date.strftime("%Y-%m-%d")
        if breadth_cache.needs_update(target_date):
            dates_to_calculate.append(target_date)

    if progress_callback:
        progress_callback(50, f"Calculating {len(dates_to_calculate)} new dates")

    total_dates = len(dates_to_calculate)
    for i, target_date in enumerate(dates_to_calculate):
        if progress_callback:
            pct = int(50 + ((i + 1) / total_dates) * 40)
            progress_callback(pct, f"Calculating date {i+1}/{total_dates}: {target_date}")

        counts = _calculate_date_breadth(all_stocks_data, target_date)

        if counts:
            result = {
                "date": target_date.strftime("%Y-%m-%d"),
                "up_4_5_pct": counts["up_4_5"],
                "down_4_5_pct": counts["down_4_5"],
                "up_20_pct_5d": counts["up_20_5d"],
                "down_20_pct_5d": counts["down_20_5d"],
                "above_20ma": counts["above_20ma"],
                "below_20ma": counts["below_20ma"],
                "above_50ma": counts["above_50ma"],
                "below_50ma": counts["below_50ma"],
            }
            breadth_results[date_key] = result
            breadth_cache.update_breadth_cache(target_date.strftime("%Y-%m-%d"), counts)

    breadth_results_list = list(breadth_results.values())
    breadth_results_list.sort(key=lambda x: x["date"], reverse=True)

    today = date.today()
    recent_dates = []
    for i in range(7):
        check_date = today - timedelta(days=i)
        if check_date.weekday() < 5:
            recent_dates.append(check_date)

    for recent_date in recent_dates:
        date_key = recent_date.strftime("%Y-%m-%d")
        if date_key not in breadth_results:
            counts = _calculate_date_breadth(all_stocks_data, recent_date)
            if counts:
                result = {
                    "date": date_key,
                    "up_4_5_pct": counts["up_4_5"],
                    "down_4_5_pct": counts["down_4_5"],
                    "up_20_pct_5d": counts["up_20_5d"],
                    "down_20_pct_5d": counts["down_20_5d"],
                    "above_20ma": counts["above_20ma"],
                    "below_20ma": counts["below_20ma"],
                    "above_50ma": counts["above_50ma"],
                    "below_50ma": counts["below_50ma"],
                }
                breadth_results[date_key] = result
                breadth_results_list.insert(0, result)

    if progress_callback:
        progress_callback(100, f"Completed: {len(breadth_results_list)} dates")

    return breadth_results_list


def _calculate_date_breadth(all_stocks_data: Dict[str, pd.DataFrame], target_date: date) -> Dict[str, int]:
    counts = {
        "up_4_5": 0,
        "down_4_5": 0,
        "up_20_5d": 0,
        "down_20_5d": 0,
        "above_20ma": 0,
        "below_20ma": 0,
        "above_50ma": 0,
        "below_50ma": 0,
    }
    stocks_with_data = 0

    for symbol, df in all_stocks_data.items():
        try:
            if target_date not in [idx.date() for idx in df.index]:
                continue

            date_data = df[df.index.date == target_date]
            if date_data.empty:
                continue

            latest = date_data.iloc[-1]
            stocks_with_data += 1

            price_change = latest.get("price_change_1d", 0)
            price_change_5d = latest.get("price_change_5d", 0)
            close = latest.get("close", 0)
            sma_20 = latest.get("sma_20", None)

            if price_change >= 0.045:
                counts["up_4_5"] += 1
            elif price_change <= -0.045:
                counts["down_4_5"] += 1

            if price_change_5d >= 0.20:
                counts["up_20_5d"] += 1
            elif price_change_5d <= -0.20:
                counts["down_20_5d"] += 1

            if sma_20 is not None and not pd.isna(sma_20):
                if close >= sma_20:
                    counts["above_20ma"] += 1
                else:
                    counts["below_20ma"] += 1

            if len(df) >= 50:
                date_idx = pd.Timestamp(target_date)
                if date_idx in df.index:
                    end_idx = df.index.get_loc(date_idx)
                    if end_idx >= 49:
                        ma_50_window = df.iloc[end_idx - 49 : end_idx + 1]["close"].mean()
                        if close >= ma_50_window:
                            counts["above_50ma"] += 1
                        else:
                            counts["below_50ma"] += 1
        except Exception:
            continue

    if stocks_with_data >= 100:
        return counts
    return {}
