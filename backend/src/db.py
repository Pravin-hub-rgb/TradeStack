"""
SQLite Database Manager for TradeStack
Shared local database used by both Python (data microservice) and Node.js (live trader).

Tables:
  - cache_index: Metadata index for .pkl cache files (replaces filesystem glob scans)
  - settings: Key-value config store with type, category, label, validation metadata
  - settings_meta: Settings schema version tracking for migrations

This is a FILE-based SQLite database (data/settings.db).
No PostgreSQL, no server process. Zero configuration.
"""

import logging
import sqlite3
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "settings.db"

# --- Schema ---

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS cache_index (
    symbol          TEXT PRIMARY KEY,
    row_count       INTEGER NOT NULL DEFAULT 0,
    first_date      TEXT,
    last_date       TEXT,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upstox_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    type        TEXT NOT NULL DEFAULT 'string',
    category    TEXT NOT NULL DEFAULT 'general',
    label       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    min         TEXT,
    max         TEXT,
    step        TEXT,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_list_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    list_type TEXT NOT NULL,
    symbol    TEXT NOT NULL,
    close     REAL,
    trend_context TEXT,
    period    INTEGER,
    depth_pct REAL,
    added_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(list_type, symbol)
);

CREATE TABLE IF NOT EXISTS breadth_results (
    date_key    TEXT PRIMARY KEY,
    up_4_5      INTEGER NOT NULL DEFAULT 0,
    down_4_5    INTEGER NOT NULL DEFAULT 0,
    up_20_5d    INTEGER NOT NULL DEFAULT 0,
    down_20_5d  INTEGER NOT NULL DEFAULT 0,
    above_20ma  INTEGER NOT NULL DEFAULT 0,
    below_20ma  INTEGER NOT NULL DEFAULT 0,
    above_50ma  INTEGER NOT NULL DEFAULT 0,
    below_50ma  INTEGER NOT NULL DEFAULT 0,
    stocks_with_data INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trade_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL,
    instrument_key  TEXT,
    entry_price     REAL,
    entry_sl        REAL,
    entry_time      TEXT,
    entry_date      TEXT,
    session_id      TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    exit_date       TEXT,
    pnl_type        TEXT CHECK(pnl_type IN ('profit', 'loss')),
    pnl_amount      REAL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# --- Connection (thread-local) ---
"""
SQLite connections are per-thread. We use threading.local() so each thread
(main thread, uvicorn worker threads, background task threads) gets its own
connection. All connections share the same on-disk .db file via WAL mode.
This is the correct pattern for a multi-threaded FastAPI app.
"""

_local = threading.local()


def get_connection() -> sqlite3.Connection:
    """Get the current thread's SQLite connection, creating it if needed."""
    if not hasattr(_local, "conn") or _local.conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _local.conn = sqlite3.connect(str(DB_PATH))
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA synchronous=NORMAL")
        logger.debug(f"SQLite connection opened for thread {threading.current_thread().name}")
    return _local.conn


def init_db():
    """Create all tables if they don't exist. Safe to call from any thread."""
    conn = get_connection()
    conn.executescript(SCHEMA_SQL)
    conn.commit()


# --- Cache Index CRUD ---


def upsert_cache_index(
    symbol: str,
    row_count: int,
    first_date: Optional[str],
    last_date: Optional[str],
    file_size_bytes: int,
):
    """Insert or replace a cache index entry for one stock."""
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO cache_index (symbol, row_count, first_date, last_date, file_size_bytes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
            row_count = excluded.row_count,
            first_date = excluded.first_date,
            last_date = excluded.last_date,
            file_size_bytes = excluded.file_size_bytes,
            updated_at = excluded.updated_at
        """,
        (symbol.upper(), row_count, first_date, last_date, file_size_bytes, datetime.now().isoformat()),
    )
    conn.commit()


def delete_cache_index(symbol: str):
    """Remove a stock from the cache index."""
    conn = get_connection()
    conn.execute("DELETE FROM cache_index WHERE symbol = ?", (symbol.upper(),))
    conn.commit()


def get_cache_stats() -> dict:
    """
    Return aggregate cache statistics from the index.
    Falls back to empty defaults if table is empty or doesn't exist.
    """
    conn = get_connection()
    row = conn.execute(
        """
        SELECT
            COUNT(*) AS stock_count,
            COALESCE(SUM(file_size_bytes), 0) AS total_bytes,
            MAX(last_date) AS latest_date
        FROM cache_index
        """
    ).fetchone()
    if not row or row["stock_count"] == 0:
        return {"stock_count": 0, "total_size_mb": 0.0, "latest_date": None}
    return {
        "stock_count": row["stock_count"],
        "total_size_mb": round(row["total_bytes"] / (1024 * 1024), 2),
        "latest_date": row["latest_date"],
    }


def list_symbols_from_index() -> list[str]:
    """Return sorted list of all cached symbols from the index."""
    conn = get_connection()
    rows = conn.execute("SELECT symbol FROM cache_index ORDER BY symbol").fetchall()
    return [r["symbol"] for r in rows]


def rebuild_cache_index(cache_dir: Path):
    """
    Scan all .pkl files in cache_dir and rebuild the entire cache_index table.
    Used for first-time setup or recovery if index gets out of sync.
    """
    import pickle
    import pandas as pd

    pkl_files = list(cache_dir.glob("*.pkl"))
    conn = get_connection()
    conn.execute("DELETE FROM cache_index")
    conn.commit()

    count = 0
    for pkl_file in pkl_files:
        symbol = pkl_file.stem.upper()
        try:
            file_size = pkl_file.stat().st_size
            with open(pkl_file, "rb") as f:
                data = pickle.load(f)
            if not isinstance(data, pd.DataFrame) or data.empty:
                continue
            row_count = len(data)
            first_date = str(data.index[0].date()) if hasattr(data.index[0], "date") else str(data.index[0])
            last_date = str(data.index[-1].date()) if hasattr(data.index[-1], "date") else str(data.index[-1])
            conn.execute(
                """
                INSERT INTO cache_index (symbol, row_count, first_date, last_date, file_size_bytes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (symbol, row_count, first_date, last_date, file_size, datetime.now().isoformat()),
            )
            count += 1
            if count % 500 == 0:
                conn.commit()
                logger.info(f"Rebuilt {count}/{len(pkl_files)} index entries...")
        except Exception as e:
            logger.warning(f"Skipping {symbol} during index rebuild: {e}")
            continue

    conn.commit()
    logger.info(f"Cache index rebuilt: {count} entries from {len(pkl_files)} files")
    return count


# --- Upstox Config CRUD ---


def upstox_get(key: str) -> Optional[str]:
    """Get a config value by key."""
    conn = get_connection()
    row = conn.execute("SELECT value FROM upstox_config WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def upstox_set(key: str, value: str):
    """Set a config value (upsert)."""
    conn = get_connection()
    conn.execute(
        "INSERT INTO upstox_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


# --- Settings CRUD ---


def settings_get_all() -> list[dict]:
    """Return all settings rows."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT key, value, type, category, label, description, min, max, step, updated_at "
        "FROM settings ORDER BY category, key"
    ).fetchall()
    return [dict(r) for r in rows]


def settings_get(key: str) -> Optional[dict]:
    """Get a single setting row."""
    conn = get_connection()
    row = conn.execute(
        "SELECT key, value, type, category, label, description, min, max, step, updated_at "
        "FROM settings WHERE key = ?", (key,)
    ).fetchone()
    return dict(row) if row else None


def settings_upsert(
    key: str,
    value: str,
    type: str = "string",
    category: str = "general",
    label: str = "",
    description: str = "",
    min: Optional[str] = None,
    max: Optional[str] = None,
    step: Optional[str] = None,
):
    """Insert or update a setting."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO settings (key, value, type, category, label, description, min, max, step, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               type = excluded.type,
               category = excluded.category,
               label = excluded.label,
               description = excluded.description,
               min = excluded.min,
               max = excluded.max,
               step = excluded.step,
               updated_at = excluded.updated_at""",
        (key, str(value), type, category, label, description, min, max, step, datetime.now().isoformat()),
    )
    conn.commit()


def settings_set_value(key: str, value: str):
    """Update only the value of an existing setting."""
    conn = get_connection()
    conn.execute(
        "UPDATE settings SET value = ?, updated_at = ? WHERE key = ?",
        (str(value), datetime.now().isoformat(), key),
    )
    conn.commit()


def settings_reset_category(category: str):
    """Delete all settings in a category (for re-seeding)."""
    conn = get_connection()
    conn.execute("DELETE FROM settings WHERE category = ?", (category,))
    conn.commit()


def settings_get_meta(key: str) -> Optional[str]:
    """Get a meta value."""
    conn = get_connection()
    row = conn.execute("SELECT value FROM settings_meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def settings_set_meta(key: str, value: str):
    """Set a meta value (upsert)."""
    conn = get_connection()
    conn.execute(
        "INSERT INTO settings_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


# --- Stock List CRUD ---


def add_stock_to_list(
    list_type: str,
    symbol: str,
    close: Optional[float] = None,
    trend_context: Optional[str] = None,
    period: Optional[int] = None,
    depth_pct: Optional[float] = None,
) -> bool:
    """Add a stock to a trading list (upsert). Returns True if new, False if updated."""
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM stock_list_items WHERE list_type = ? AND symbol = ?",
        (list_type, symbol.upper()),
    ).fetchone()
    conn.execute(
        """INSERT INTO stock_list_items (list_type, symbol, close, trend_context, period, depth_pct, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(list_type, symbol) DO UPDATE SET
               close = excluded.close,
               trend_context = excluded.trend_context,
               period = excluded.period,
               depth_pct = excluded.depth_pct,
               added_at = CURRENT_TIMESTAMP""",
        (list_type, symbol.upper(), close, trend_context, period, depth_pct, datetime.now().isoformat()),
    )
    conn.commit()
    return existing is None


def remove_stock_from_list(list_type: str, symbol: str) -> bool:
    """Remove a stock from a trading list. Returns True if it existed."""
    conn = get_connection()
    cur = conn.execute(
        "DELETE FROM stock_list_items WHERE list_type = ? AND symbol = ?",
        (list_type, symbol.upper()),
    )
    conn.commit()
    return cur.rowcount > 0


def get_stock_list(list_type: str) -> list[dict]:
    """Return all items in a trading list ordered by added_at descending."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, list_type, symbol, close, trend_context, period, depth_pct, added_at "
        "FROM stock_list_items WHERE list_type = ? ORDER BY added_at DESC",
        (list_type,),
    ).fetchall()
    return [dict(r) for r in rows]


def is_stock_in_list(list_type: str, symbol: str) -> bool:
    """Check if a stock is already in a trading list."""
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM stock_list_items WHERE list_type = ? AND symbol = ?",
        (list_type, symbol.upper()),
    ).fetchone()
    return row is not None


def clear_stock_list(list_type: str) -> int:
    """Remove all items from a trading list. Returns count deleted."""
    conn = get_connection()
    cur = conn.execute("DELETE FROM stock_list_items WHERE list_type = ?", (list_type,))
    conn.commit()
    return cur.rowcount


# --- Breadth Results CRUD ---


def upsert_breadth(
    date_key: str,
    up_4_5: int = 0,
    down_4_5: int = 0,
    up_20_5d: int = 0,
    down_20_5d: int = 0,
    above_20ma: int = 0,
    below_20ma: int = 0,
    above_50ma: int = 0,
    below_50ma: int = 0,
    stocks_with_data: int = 0,
):
    """Insert or update breadth results for a date."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO breadth_results (date_key, up_4_5, down_4_5, up_20_5d, down_20_5d,
                                         above_20ma, below_20ma, above_50ma, below_50ma, stocks_with_data, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(date_key) DO UPDATE SET
               up_4_5 = excluded.up_4_5,
               down_4_5 = excluded.down_4_5,
               up_20_5d = excluded.up_20_5d,
               down_20_5d = excluded.down_20_5d,
               above_20ma = excluded.above_20ma,
               below_20ma = excluded.below_20ma,
               above_50ma = excluded.above_50ma,
               below_50ma = excluded.below_50ma,
               stocks_with_data = excluded.stocks_with_data,
               updated_at = excluded.updated_at""",
        (date_key, up_4_5, down_4_5, up_20_5d, down_20_5d,
         above_20ma, below_20ma, above_50ma, below_50ma, stocks_with_data, datetime.now().isoformat()),
    )
    conn.commit()


def get_all_breadth() -> list[dict]:
    """Return all breadth results ordered by date descending."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM breadth_results ORDER BY date_key DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_breadth_date_keys() -> list[str]:
    """Return all date keys that have breadth results."""
    conn = get_connection()
    rows = conn.execute("SELECT date_key FROM breadth_results ORDER BY date_key").fetchall()
    return [r["date_key"] for r in rows]


def clear_breadth():
    """Delete all breadth results."""
    conn = get_connection()
    conn.execute("DELETE FROM breadth_results")
    conn.commit()


# --- Trade Log CRUD ---


def add_trade_log(symbol: str, instrument_key: str, entry_price: float, entry_sl: float | None,
                   entry_time: str, entry_date: str, session_id: str,
                   trade_type: str = "continuation", quantity: int = 100) -> int:
    """Record a paper trade entry."""
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO trade_log (symbol, instrument_key, entry_price, entry_sl, entry_time, entry_date, session_id, trade_type, quantity) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (symbol.upper(), instrument_key, entry_price, entry_sl, entry_time, entry_date, session_id, trade_type, quantity),
    )
    conn.commit()
    return cur.lastrowid


def get_trade_logs(start_date: str | None = None, end_date: str | None = None) -> list[dict]:
    """Return trade log entries, optionally filtered by date range."""
    conn = get_connection()
    if start_date and end_date:
        rows = conn.execute(
            "SELECT * FROM trade_log WHERE entry_date BETWEEN ? AND ? ORDER BY created_at DESC",
            (start_date, end_date),
        ).fetchall()
    elif start_date:
        rows = conn.execute(
            "SELECT * FROM trade_log WHERE entry_date >= ? ORDER BY created_at DESC", (start_date,)
        ).fetchall()
    elif end_date:
        rows = conn.execute(
            "SELECT * FROM trade_log WHERE entry_date <= ? ORDER BY created_at DESC", (end_date,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM trade_log ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_daily_entry_counts(year: int, month: int | None = None) -> list[dict]:
    """Return {date, count} per day. If month is None, returns all days in the year."""
    conn = get_connection()
    if month is not None:
        pattern = f"{year:04d}-{month:02d}%"
    else:
        pattern = f"{year:04d}%"
    rows = conn.execute(
        """SELECT entry_date, COUNT(*) AS count FROM trade_log
           WHERE entry_date LIKE ? GROUP BY entry_date ORDER BY entry_date""",
        (pattern,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_trade_stats() -> dict:
    """Return cumulative trade statistics."""
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) AS c FROM trade_log").fetchone()
    active = conn.execute("SELECT COUNT(*) AS c FROM trade_log WHERE status = 'active'").fetchone()
    by_date = conn.execute(
        "SELECT entry_date, COUNT(*) AS c FROM trade_log GROUP BY entry_date ORDER BY entry_date DESC"
    ).fetchall()
    return {
        "total_trades": total["c"] if total else 0,
        "active_trades": active["c"] if active else 0,
        "daily_breakdown": [dict(r) for r in by_date],
    }


# --- Migrations ---


def _run_migrations():
    """Add columns that may not exist yet (older databases)."""
    conn = get_connection()
    for col, dtype in [("exit_date", "TEXT"), ("pnl_type", "TEXT"), ("pnl_amount", "REAL"),
                       ("trade_type", "TEXT"), ("exit_price", "REAL"), ("quantity", "INTEGER DEFAULT 100")]:
        try:
            conn.execute(f"ALTER TABLE trade_log ADD COLUMN {col} {dtype}")
        except Exception:
            pass  # column already exists
    conn.commit()


# --- Trade Log CRUD (updated) ---


def update_trade_log(trade_id: int, exit_date: str | None = None,
                     exit_price: float | None = None):
    """Update a trade log entry with exit info and P&L.
    If exit_price is provided, P&L is auto-calculated from entry_price and quantity."""
    conn = get_connection()
    if exit_price is not None:
        row = conn.execute(
            "SELECT entry_price, quantity FROM trade_log WHERE id = ?", (trade_id,)
        ).fetchone()
        if row:
            pnl_amount = (exit_price - row["entry_price"]) * (row["quantity"] or 100)
            pnl_type = "profit" if pnl_amount >= 0 else "loss"
            conn.execute(
                "UPDATE trade_log SET exit_date = ?, exit_price = ?, pnl_type = ?, pnl_amount = ?, status = 'closed' WHERE id = ?",
                (exit_date, exit_price, pnl_type, abs(pnl_amount), trade_id),
            )
        else:
            conn.execute(
                "UPDATE trade_log SET exit_date = ?, exit_price = ?, status = 'closed' WHERE id = ?",
                (exit_date, exit_price, trade_id),
            )
    else:
        conn.execute(
            "UPDATE trade_log SET exit_date = ? WHERE id = ?",
            (exit_date, trade_id),
        )
    conn.commit()


def delete_trade_log(trade_id: int):
    """Delete a trade log entry."""
    conn = get_connection()
    conn.execute("DELETE FROM trade_log WHERE id = ?", (trade_id,))
    conn.commit()


def get_daily_pnl(year: int, month: int) -> list[dict]:
    """Return per-day net P&L and trade count for heatmap. net_pnl is NULL when all trades on that day are unsettled."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT entry_date,
                   COUNT(*) AS trade_count,
                   SUM(CASE WHEN pnl_type = 'profit' THEN pnl_amount
                            WHEN pnl_type = 'loss' THEN -pnl_amount
                       END) AS net_pnl
           FROM trade_log
           WHERE entry_date LIKE ?
           GROUP BY entry_date
           ORDER BY entry_date""",
        (f"{year:04d}-{month:02d}%",),
    ).fetchall()
    return [dict(r) for r in rows]


def get_yearly_pnl(year: int) -> list[dict]:
    """Same as get_daily_pnl but for the full year."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT entry_date,
                   COUNT(*) AS trade_count,
                   SUM(CASE WHEN pnl_type = 'profit' THEN pnl_amount
                            WHEN pnl_type = 'loss' THEN -pnl_amount
                       END) AS net_pnl
           FROM trade_log
           WHERE entry_date LIKE ?
           GROUP BY entry_date
           ORDER BY entry_date""",
        (f"{year:04d}%",),
    ).fetchall()
    return [dict(r) for r in rows]


def update_get_trade_stats() -> dict:
    """Return trade statistics (total, profitable, losing, unsettled)."""
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) AS c FROM trade_log").fetchone()
    profitable = conn.execute("SELECT COUNT(*) AS c FROM trade_log WHERE pnl_type = 'profit'").fetchone()
    losing = conn.execute("SELECT COUNT(*) AS c FROM trade_log WHERE pnl_type = 'loss'").fetchone()
    unsettled = conn.execute("SELECT COUNT(*) AS c FROM trade_log WHERE pnl_type IS NULL").fetchone()
    return {
        "total_trades": total["c"] if total else 0,
        "profitable": profitable["c"] if profitable else 0,
        "losing": losing["c"] if losing else 0,
        "unsettled": unsettled["c"] if unsettled else 0,
    }


def get_capital_stats() -> dict:
    """Return capital statistics (initial_capital, realized_pnl, available_capital, open_position_value)."""
    conn = get_connection()
    cap_row = conn.execute("SELECT value FROM settings WHERE key = 'trading_capital'").fetchone()
    initial_capital = float(cap_row["value"]) if cap_row else 100000

    realized = conn.execute(
        """SELECT COALESCE(SUM(CASE WHEN pnl_type = 'profit' THEN pnl_amount
                                   WHEN pnl_type = 'loss' THEN -pnl_amount ELSE 0 END), 0) AS total
           FROM trade_log WHERE exit_price IS NOT NULL"""
    ).fetchone()
    realized_pnl = round(realized["total"], 2) if realized else 0

    open_val = conn.execute(
        """SELECT COALESCE(SUM(entry_price * COALESCE(quantity, 100)), 0) AS val
           FROM trade_log WHERE status = 'active'"""
    ).fetchone()
    open_position_value = round(open_val["val"], 2) if open_val else 0

    return {
        "initial_capital": initial_capital,
        "realized_pnl": realized_pnl,
        "available_capital": round(max(0, initial_capital + realized_pnl - open_position_value), 2),
        "open_position_value": open_position_value,
    }


# --- Initialize on import ---

init_db()
_run_migrations()
