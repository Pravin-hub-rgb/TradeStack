"""
Central logging configuration for TradeStack backend.

One call configures:
  - console handler (INFO, compact)
  - rotating file handler → data/logs/backend.log (2 MB × 3 backups)
  - noise reduction for chatty libraries (urllib3, etc.)

Idempotent: calling setup_logging() twice is a no-op unless force=True.
Dependency-free so any module can import it safely (no db/settings imports —
the caller may read the log level from settings and pass it in).
"""

import logging
import logging.handlers
import os
import sys
from pathlib import Path

# data/logs lives at the project root (backend/src/logging_config.py → repo/data/logs)
_DEFAULT_LOGS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "logs"

# Handlers can be re-added on force=True; remember which ones are ours.
_OWN_HANDLERS: list[logging.Handler] = []

_CONFIGURED = False

_NOISY_LOGGERS = {
    "urllib3": logging.WARNING,
    "urllib3.connectionpool": logging.WARNING,
    "asyncio": logging.WARNING,
}


def _build_logs_dir(logs_dir: Path | None) -> Path:
    if logs_dir is not None:
        return Path(logs_dir)
    env_override = os.environ.get("TRADESTACK_LOGS_DIR")
    if env_override:
        return Path(env_override)
    return _DEFAULT_LOGS_DIR


def setup_logging(
    level: str = "INFO",
    logs_dir: Path | None = None,
    force: bool = False,
) -> logging.Logger:
    """Configure the root logger with console + rotating file output.

    Args:
        level: root logger level name ("DEBUG", "INFO", ...).
        logs_dir: override the log directory (tests pass a tmp path).
        force: tear down previously-added handlers and rebuild.
    """
    global _CONFIGURED

    root = logging.getLogger()

    if _CONFIGURED and not force:
        return root

    dir_path = _build_logs_dir(logs_dir)
    dir_path.mkdir(parents=True, exist_ok=True)

    if force:
        for h in _OWN_HANDLERS:
            try:
                root.removeHandler(h)
                h.close()
            except Exception:
                pass
        _OWN_HANDLERS.clear()

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(fmt)

    log_file = dir_path / "backend.log"
    file_handler = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=2 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)   # file always gets everything
    file_handler.setFormatter(fmt)

    try:
        level_no = logging.getLevelName(str(level).upper())
        numeric = level_no if isinstance(level_no, int) else logging.INFO
    except Exception:
        numeric = logging.INFO

    root.setLevel(numeric)
    root.addHandler(console)
    root.addHandler(file_handler)
    _OWN_HANDLERS.extend([console, file_handler])

    for name, quiet_level in _NOISY_LOGGERS.items():
        logging.getLogger(name).setLevel(quiet_level)

    _CONFIGURED = True
    return root


def tracking_handler() -> logging.Handler | None:
    """Return the file handler added by setup_logging (test introspection helper)."""
    for h in _OWN_HANDLERS:
        if isinstance(h, logging.handlers.RotatingFileHandler):
            return h
    return None
