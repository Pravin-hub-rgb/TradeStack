"""One-shot backend bootstrap: SQLite schema + seeded settings + cache index.

Run after pip install, before (or instead of) letting the server do lazy init:

    backend\\venv\\Scripts\\python.exe backend\\seed_db.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.db import init_db                              # noqa: E402
from src.settings import ensure_settings                # noqa: E402
from src.cache_manager import cache_manager as cache    # noqa: E402


def main():
    init_db()
    ensure_settings()
    count = cache.rebuild_index()
    print(f"[seed] SQLite schema + settings ready: {cache.cache_dir.parent}")
    print(f"[seed] Cache index rebuilt: {count} entries from {cache.cache_dir}")


if __name__ == "__main__":
    main()
