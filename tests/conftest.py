"""
Shared pytest fixtures for TradeStack backend tests.

CRITICAL: TRADESTACK_DB_PATH must be set BEFORE any `src.*` import because
backend/src/db.py binds DB_PATH at import time. That is why the env var is
set here at module top-level of conftest.py — pytest imports conftest before
collecting any test module.
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"

# Session-wide temp dir: every pytest run gets a fresh, isolated database
_TMP_ROOT = Path(tempfile.mkdtemp(prefix="tradestack_pytest_"))
os.environ["TRADESTACK_DB_PATH"] = str(_TMP_ROOT / "settings.db")

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

_APP_TABLES = (
    "settings",
    "settings_meta",
    "stock_list_items",
    "breadth_results",
    "trade_log",
    "cache_index",
    "upstox_config",
)


def _wipe_tables(conn):
    for table in _APP_TABLES:
        try:
            conn.execute(f"DELETE FROM {table}")
        except Exception:
            pass
    conn.commit()


@pytest.fixture
def clean_db():
    """Wipe all app tables before AND after each test. Schema comes from import-time init_db() in src.db."""
    from src import db

    conn = db.get_connection()
    _wipe_tables(conn)
    yield db
    _wipe_tables(conn)


@pytest.fixture
def tmp_cache(tmp_path):
    """A CacheManager pointed at a per-test temp dir (does NOT touch the real data/cache)."""
    from src.cache_manager import CacheManager

    return CacheManager(cache_dir=str(tmp_path / "cache"))
