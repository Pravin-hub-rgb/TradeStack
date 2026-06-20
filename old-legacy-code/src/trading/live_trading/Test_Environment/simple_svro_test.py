#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple SVRO Test - Basic validation without complex imports
Tests core SVRO logic with minimal dependencies
"""

import sys
import os
import time
from datetime import datetime

# Add the continuation_stock_monitor directly to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'trading', 'live_trading'))

try:
    from continuation_stock_monitor import StockMonitor
    print("[OK] Successfully imported StockMonitor")
except ImportError as e:
    print(f"[FAIL] Failed to import StockMonitor: {e}")
    print("This test requires the continuation_stock_monitor module")
    sys.exit(1)


def test_basic_svro_logic():
    """Test basic SVRO logic"""
    print("\n[TEST_TUBE] Basic SVRO Logic Test")
    print("=" * 40)
    
    # Create monitor
    monitor = StockMonitor()
    
    # Test stock
    test_stock = {
        'symbol': 'TEST',
        'instrument_key': 'TEST_KEY',
        'previous_close': 100.0,
        'open_price': 102.0,
        'volume_baseline': 1000000.0
    }
    
    # Add stock
    monitor.add_stock(
        symbol=test_stock['symbol'],
        instrument_key=test_stock['instrument_key'],
        previous_close=test_stock['previous_close'],
        situation='continuation'
    )
    
    # Set opening price
    stock = monitor.stocks[test_stock['instrument_key']]
    stock.set_open_price(test_stock['open_price'])
    stock.volume_baseline = test_stock['volume_baseline']
    
    print(f"Stock: {test_stock['symbol']}")
    print(f"Previous Close: {test_stock['previous_close']:.2f}")
    print(f"Open Price: {test_stock['open_price']:.2f}")
    print(f"Gap: {((test_stock['open_price'] - test_stock['previous_close']) / test_stock['previous_close'] * 100):+.1f}%")
    
    # Test gap validation
    print("\n1. Testing Gap Validation:")
    gap_valid = stock.validate_gap()
    print(f"   Gap validation: {'[OK] PASS' if gap_valid else '[FAIL] FAIL'}")
    
    # Test low violation
    print("\n2. Testing Low Violation:")
    stock.check_low_violation()
    low_valid = not stock.rejection_reason or 'Low violation' not in stock.rejection_reason
    print(f"   Low violation check: {'[OK] PASS' if low_valid else '[FAIL] FAIL'}")
    if not low_valid:
        print(f"   Rejection reason: {stock.rejection_reason}")
    
    # Test volume validation
    print("\n3. Testing Volume Validation:")
    stock.early_volume = test_stock['volume_baseline'] * 0.10  # 10% volume
    volume_valid = stock.validate_volume(test_stock['volume_baseline'])
    print(f"   Volume validation (10%): {'[OK] PASS' if volume_valid else '[FAIL] FAIL'}")
    
    # Test entry preparation
    print("\n4. Testing Entry Preparation:")
    if volume_valid:
        stock.prepare_entry()
        entry_ready = stock.entry_ready
        print(f"   Entry preparation: {'[OK] PASS' if entry_ready else '[FAIL] FAIL'}")
        if entry_ready:
            print(f"   Entry High: {stock.entry_high:.2f}")
            print(f"   Entry SL: {stock.entry_sl:.2f}")
    
    # Summary
    print("\n" + "=" * 40)
    print("TEST SUMMARY:")
    print(f"  Gap Validation: {'[OK]' if gap_valid else '[FAIL]'}")
    print(f"  Low Violation: {'[OK]' if low_valid else '[FAIL]'}")
    print(f"  Volume Validation: {'[OK]' if volume_valid else '[FAIL]'}")
    
    all_passed = gap_valid and low_valid and volume_valid
    print(f"\nOVERALL: {'[DONE] ALL TESTS PASSED!' if all_passed else '[FAIL] SOME TESTS FAILED'}")
    
    return all_passed


def main():
    """Main test runner"""
    print("[ROCKET] Simple SVRO Test Starting...")
    
    try:
        success = test_basic_svro_logic()
        return success
    except Exception as e:
        print(f"[FAIL] Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)