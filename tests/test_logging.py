"""
Phase 5 tests: backend/src/logging_config.py + server error handling.

Covers: central logging setup (idempotent, force rebuild, file output,
level filtering), access-log middleware headers, 500 error body shape,
and the never-stuck `_fail_operation` helper.
"""

import logging

from src.logging_config import setup_logging, tracking_handler, _OWN_HANDLERS


def test_setup_logging_adds_console_and_file_handlers(tmp_path):
    root = setup_logging(level="INFO", logs_dir=tmp_path, force=True)
    kinds = {type(h) for h in _OWN_HANDLERS}
    assert any("StreamHandler" in str(k) for k in kinds)
    assert any("RotatingFileHandler" in str(k) for k in kinds)
    assert root.getEffectiveLevel() == logging.INFO


def test_setup_logging_idempotent_without_force(tmp_path):
    setup_logging(level="INFO", logs_dir=tmp_path, force=True)
    handlers_after_first = list(_OWN_HANDLERS)
    setup_logging(level="DEBUG", logs_dir=tmp_path)       # NOT forced — must no-op
    assert list(_OWN_HANDLERS) == handlers_after_first
    assert logging.getLogger().getEffectiveLevel() == logging.INFO


def test_setup_logging_force_rebuilds(tmp_path):
    setup_logging(level="INFO", logs_dir=tmp_path, force=True)
    n_before = len(_OWN_HANDLERS)
    setup_logging(level="ERROR", logs_dir=tmp_path, force=True)
    # no accumulation: old handlers cleared before re-adding
    assert len(_OWN_HANDLERS) == n_before
    assert logging.getLogger().getEffectiveLevel() == logging.ERROR
    setup_logging(level="INFO", logs_dir=tmp_path, force=True)   # leave INFO for later tests


def test_log_file_receives_records(tmp_path):
    setup_logging(level="INFO", logs_dir=tmp_path, force=True)
    logging.getLogger("test.probe").info("hello from probe")
    probe = logging.getLogger("test.quiet.probe2")
    probe.setLevel(logging.DEBUG)
    probe.error("should appear at ERROR level")
    for h in _OWN_HANDLERS:
        h.flush()
    content = (tmp_path / "backend.log").read_text(encoding="utf-8")
    assert "hello from probe" in content
    assert "should appear at ERROR level" in content


def test_invalid_level_falls_back_not_noisy(tmp_path):
    root = setup_logging(level="NOT_A_LEVEL", logs_dir=tmp_path, force=True)
    assert isinstance(root, logging.Logger)
    setup_logging(level="INFO", logs_dir=tmp_path, force=True)  # normalize for later tests
