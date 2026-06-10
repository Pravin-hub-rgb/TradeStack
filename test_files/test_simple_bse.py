#!/usr/bin/env python3
"""
Simple Test: BSE Previous Close from Cache
"""

import sys
sys.path.append('src')

def test_simple_bse():
    """Simple test of BSE previous close from cache"""
    print("[TEST_TUBE] SIMPLE TEST: BSE Previous Close from Cache")
    print("=" * 50)

    from utils.upstox_fetcher import UpstoxFetcher

    fetcher = UpstoxFetcher()
    close = fetcher.get_previous_close_from_cache('BSE')

    if close is not None:
        print(f"[TARGET] BSE Previous Close: ₹{close:.2f}")
        expected = 2744.90
        if abs(close - expected) < 0.01:
            print("[OK] SUCCESS! Cache data is correct!")
            return True
        else:
            print(f"[FAIL] FAILED! Expected ₹{expected:.2f}, got ₹{close:.2f}")
            return False
    else:
        print("[FAIL] No cache data found for BSE")
        return False

if __name__ == "__main__":
    success = test_simple_bse()
    print("\n" + "=" * 50)
    if success:
        print("[DONE] CACHE DATA VERIFIED!")
        print("[OK] Previous close: ACCURATE")
        print("[OK] Live trading: READY")
    else:
        print("[WARN]  CHECK CACHE DATA")
    print("=" * 50)