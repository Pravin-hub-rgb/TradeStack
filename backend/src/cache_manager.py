"""
Cache Manager for TradeStack
Manages per-stock .pkl cache files in data/cache/
Maintains a SQLite cache_index table for fast metadata lookups.

Flow:
  1. save() writes .pkl file to disk
  2. save() then writes metadata to SQLite cache_index table
  3. stats() first queries SQLite (instant), falls back to filesystem glob
  4. list_symbols() first queries SQLite, falls back to glob
"""

import pickle
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import pandas as pd

from . import db

logger = logging.getLogger(__name__)


class CacheManager:
    def __init__(self, cache_dir: Optional[str] = None):
        if cache_dir is None:
            project_root = Path(__file__).resolve().parent.parent.parent
            cache_dir = str(project_root / "data" / "cache")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_cache_path(self, symbol: str) -> Path:
        return self.cache_dir / f"{symbol.upper()}.pkl"

    def load(self, symbol: str) -> Optional[pd.DataFrame]:
        path = self.get_cache_path(symbol)
        if not path.exists():
            return None
        try:
            with open(path, "rb") as f:
                data = pickle.load(f)
            if isinstance(data, pd.DataFrame) and not data.empty:
                logger.debug(f"Loaded cache for {symbol}: {len(data)} rows")
                return data
            return None
        except Exception as e:
            logger.warning(f"Failed to load cache for {symbol}: {e}")
            return None

    def save(self, symbol: str, data: pd.DataFrame, commit: bool = True):
        path = self.get_cache_path(symbol)
        try:
            with open(path, "wb") as f:
                pickle.dump(data, f)
            self._update_index(symbol, data, path, commit=commit)
            logger.debug(f"Saved cache for {symbol}: {len(data)} rows")
        except Exception as e:
            logger.error(f"Failed to save cache for {symbol}: {e}")
            raise

    def _update_index(self, symbol: str, data: pd.DataFrame, path: Path, commit: bool = True):
        """Write metadata to the SQLite cache_index table after saving a .pkl file."""
        if not isinstance(data, pd.DataFrame) or data.empty:
            return
        row_count = len(data)
        first = data.index[0]
        last = data.index[-1]
        first_date = str(first.date()) if hasattr(first, "date") else str(first)
        last_date = str(last.date()) if hasattr(last, "date") else str(last)
        file_size = path.stat().st_size
        if commit:
            db.upsert_cache_index(symbol, row_count, first_date, last_date, file_size)
        else:
            db.upsert_cache_index_batch(symbol, row_count, first_date, last_date, file_size)

    def get_last_date(self, symbol: str) -> Optional[date]:
        data = self.load(symbol)
        if data is None or data.empty:
            return None
        last_idx = data.index[-1]
        if hasattr(last_idx, "date"):
            return last_idx.date()
        return last_idx

    def get_last_close(self, symbol: str) -> Optional[float]:
        data = self.load(symbol)
        if data is None or data.empty or "close" not in data.columns:
            return None
        val = data["close"].iloc[-1]
        if pd.isna(val):
            return None
        return float(val)

    def get_latest_cache_date(self) -> Optional[date]:
        stats = db.get_cache_stats()
        if stats.get("latest_date"):
            try:
                return date.fromisoformat(stats["latest_date"])
            except (ValueError, TypeError):
                pass
        latest = None
        for pkl_file in self.cache_dir.glob("*.pkl"):
            last_date = self.get_last_date(pkl_file.stem)
            if last_date and (latest is None or last_date > latest):
                latest = last_date
        return latest

    def needs_update(self, symbol: str, max_age_days: int = 3) -> bool:
        last_date = self.get_last_date(symbol)
        if last_date is None:
            return True
        return (date.today() - last_date).days >= max_age_days

    def update_with_data(self, symbol: str, new_data: pd.DataFrame, existing: Optional[pd.DataFrame] = None, commit: bool = True):
        """Like update() but accepts pre-loaded existing data to avoid double load."""
        if existing is None:
            existing = self.load(symbol)
        if existing is not None and not existing.empty:
            combined = pd.concat([existing, new_data])
            combined = combined[~combined.index.duplicated(keep="last")]
            combined = combined.sort_index()
        else:
            combined = new_data
        combined["last_updated"] = pd.Timestamp.now()
        self.save(symbol, combined, commit=commit)

    def get_date_range(self, symbol: str, start: Optional[date] = None, end: Optional[date] = None) -> pd.DataFrame:
        data = self.load(symbol)
        if data is None or data.empty:
            return pd.DataFrame()
        if not isinstance(data.index, pd.DatetimeIndex):
            data.index = pd.to_datetime(data.index)
        if start:
            data = data[data.index >= pd.Timestamp(start)]
        if end:
            data = data[data.index <= pd.Timestamp(end)]
        return data

    def stats(self) -> dict:
        result = db.get_cache_stats()
        if result["stock_count"] > 0:
            return result
        files = list(self.cache_dir.glob("*.pkl"))
        total_size = sum(f.stat().st_size for f in files)
        latest_date = self.get_latest_cache_date()
        return {
            "stock_count": len(files),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "latest_date": latest_date.isoformat() if latest_date else None,
        }

    def list_symbols(self) -> list[str]:
        symbols = db.list_symbols_from_index()
        if symbols:
            return symbols
        return sorted(f.stem for f in self.cache_dir.glob("*.pkl"))

    def rebuild_index(self):
        """Rebuild the entire cache_index from .pkl files on disk."""
        count = db.rebuild_cache_index(self.cache_dir)
        logger.info(f"Cache index rebuilt: {count} entries")
        return count


cache_manager = CacheManager()
