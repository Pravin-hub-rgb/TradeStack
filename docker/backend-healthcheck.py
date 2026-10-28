#!/usr/bin/env python3
"""Lightweight healthcheck for the TradeStack backend (no curl dependency)."""
import sys
import urllib.request

try:
    with urllib.request.urlopen("http://127.0.0.1:8001/health", timeout=3) as r:
        sys.exit(0 if r.status == 200 else 1)
except Exception:
    sys.exit(1)
