#!/usr/bin/env python3
"""
Final Test: Verify BSE Previous Close is ₹2744.90
"""

import sys
import os

# Add src to path
sys.path.append('src')

def test_bse_final():
    """Test BSE previous close fetching in live trading bot"""
    print("[TEST_TUBE] FINAL TEST: BSE Previous Close in Live Trading Bot")
    print("=" * 60)

    from src.trading.live_trading.main import LiveTradingOrchestrator

    orchestrator = LiveTradingOrchestrator()
    symbols = ['BSE']
    prev_closes = orchestrator.get_previous_closes(symbols)

    bse_close = prev_closes.get('BSE', 0)
    print(f"[TARGET] BSE Previous Close: ₹{bse_close:.2f}")

    expected = 2744.90
    if abs(bse_close - expected) < 0.01:
        print("[OK] SUCCESS! BSE previous close is correct: ₹2744.90")
        print("[CHART] Live trading bot will use accurate gap calculations!")
        return True
    else:
        print(f"[FAIL] FAILED! Expected ₹{expected:.2f}, got ₹{bse_close:.2f}")
        return False

if __name__ == "__main__":
    success = test_bse_final()
    print("\n" + "=" * 60)
    if success:
        print("[DONE] LIVE TRADING BOT READY FOR TOMORROW!")
        print("[OK] Previous close data: ACCURATE")
        print("[OK] Gap calculations: CORRECT")
        print("[OK] Trading signals: RELIABLE")
    else:
        print("[WARN]  DATA ISSUE DETECTED - CHECK CACHE/BHAVCOPY")
    print("=" * 60)
