#!/usr/bin/env python3
"""
Test BSE Previous Close using historical fallback
Verify that BSE shows ₹2744.90 as previous close
"""

import sys
import os

# Add src to path
sys.path.append('src')

def test_bse_previous_close_final():
    """Test that BSE previous close is correctly fetched using historical fallback"""
    print("[TEST_TUBE] TESTING BSE PREVIOUS CLOSE - HISTORICAL FALLBACK")
    print("=" * 60)

    from trading.live_trading.main import LiveTradingOrchestrator

    orchestrator = LiveTradingOrchestrator()

    print("Testing historical previous close fetch for BSE...")

    # Test the historical fallback method
    prev_close = orchestrator.get_previous_close_from_history('BSE')

    if prev_close is not None:
        print(f"[OK] BSE Historical Previous Close: ₹{prev_close:.2f}")

        # Check if it matches expected value
        expected_close = 2744.90
        if abs(prev_close - expected_close) < 0.01:  # Allow for small rounding differences
            print(f"[OK] CORRECT: Previous close matches expected ₹{expected_close:.2f}")
            return True
        else:
            print(f"[FAIL] MISMATCH: Expected ₹{expected_close:.2f}, got ₹{prev_close:.2f}")
            return False
    else:
        print("[FAIL] ERROR: No historical previous close found for BSE")
        return False

if __name__ == "__main__":
    success = test_bse_previous_close_final()
    if success:
        print("\n[DONE] BSE Previous Close Test PASSED!")
    else:
        print("\n[FAIL] BSE Previous Close Test FAILED!")
    sys.exit(0 if success else 1)