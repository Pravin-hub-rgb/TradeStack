#!/usr/bin/env python3
"""
Test BSE Previous Close using Upstox LTP API
Verify that BSE shows ₹2744.90 as previous close
"""

import sys
import os

# Add src to path
sys.path.append('src')

def test_bse_previous_close():
    """Test that BSE previous close is correctly fetched"""
    print("[TEST_TUBE] TESTING BSE PREVIOUS CLOSE")
    print("=" * 50)

    from utils.upstox_fetcher import UpstoxFetcher

    fetcher = UpstoxFetcher()

    print("Fetching LTP data for BSE...")

    # Get LTP data for BSE
    print("Calling get_ltp_data('BSE')...")
    ltp_data = fetcher.get_ltp_data('BSE')
    print(f"Response: {ltp_data}")

    if ltp_data:
        print("[OK] LTP Data received:")
        for key, value in ltp_data.items():
            if value is not None:
                print(f"   {key}: {value}")

        # Check the 'cp' field (previous close)
        previous_close = ltp_data.get('cp')
        if previous_close is not None:
            previous_close = float(previous_close)
            print(f"\n[CHART] BSE Previous Close: ₹{previous_close:.2f}")

            # Check if it matches expected value
            expected_close = 2744.90
            if abs(previous_close - expected_close) < 0.01:  # Allow for small rounding differences
                print(f"[OK] CORRECT: Previous close matches expected ₹{expected_close:.2f}")
                return True
            else:
                print(f"[FAIL] MISMATCH: Expected ₹{expected_close:.2f}, got ₹{previous_close:.2f}")
                return False
        else:
            print("[FAIL] ERROR: 'cp' field not found in LTP data")
            return False
    else:
        print("[FAIL] ERROR: No LTP data received for BSE")
        return False

if __name__ == "__main__":
    success = test_bse_previous_close()
    if success:
        print("\n[DONE] BSE Previous Close Test PASSED!")
    else:
        print("\n[FAIL] BSE Previous Close Test FAILED!")
    sys.exit(0 if success else 1)