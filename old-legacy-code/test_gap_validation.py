#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script for gap validation logic
Tests the new flat gap threshold implementation
"""

import sys
import os

# Add the live_trading directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src', 'trading', 'live_trading'))

from config import FLAT_GAP_THRESHOLD
from continuation_stock_monitor import StockState

def test_gap_validation():
    """Test gap validation with various scenarios"""
    
    print("=" * 60)
    print("GAP VALIDATION TEST")
    print("=" * 60)
    print(f"FLAT_GAP_THRESHOLD: {FLAT_GAP_THRESHOLD*100}%")
    print()
    
    # Test cases: (name, prev_close, open_price, situation)
    test_cases = [
        # Continuation tests
        ('Continuation - Flat (0%)', 100.0, 100.0, 'continuation'),
        ('Continuation - Slightly up (0.2%)', 100.0, 100.2, 'continuation'),
        ('Continuation - Just above flat (0.4%)', 100.0, 100.4, 'continuation'),
        ('Continuation - Good gap (2%)', 100.0, 102.0, 'continuation'),
        ('Continuation - Too high (6%)', 100.0, 106.0, 'continuation'),
        
        # Reversal tests
        ('Reversal - Flat (0%)', 100.0, 100.0, 'reversal_s2'),
        ('Reversal - Slightly down (-0.2%)', 100.0, 99.8, 'reversal_s2'),
        ('Reversal - Just below flat (-0.4%)', 100.0, 99.6, 'reversal_s2'),
        ('Reversal - Good gap down (-5%)', 100.0, 95.0, 'reversal_s2'),
        ('Reversal - Deep gap down (-10%)', 100.0, 90.0, 'reversal_s2'),
        
        # Edge cases
        ('Edge - Exactly flat threshold (0.3%)', 100.0, 100.3, 'continuation'),
        ('Edge - Exactly flat threshold (-0.3%)', 100.0, 99.7, 'reversal_s2'),
    ]
    
    passed = 0
    failed = 0
    
    for name, prev_close, open_price, situation in test_cases:
        stock = StockState('TEST', 'TEST', prev_close, situation)
        stock.open_price = open_price
        result = stock.validate_gap()
        gap_pct = (open_price - prev_close) / prev_close
        
        # Determine expected result
        expected = True
        if abs(gap_pct) <= FLAT_GAP_THRESHOLD:
            expected = False  # Should be rejected (flat)
        elif situation == 'continuation':
            if gap_pct <= FLAT_GAP_THRESHOLD or gap_pct > 0.05:
                expected = False  # Should be rejected
        elif situation == 'reversal_s2':
            if gap_pct >= -FLAT_GAP_THRESHOLD:
                expected = False  # Should be rejected
        
        # Check result
        if result == expected:
            status = "PASS"
            passed += 1
        else:
            status = "FAIL"
            failed += 1
            
        print(f"{name}:")
        print(f"  Gap: {gap_pct:.1%} -> {status}")
        if not result:
            print(f"  Reason: {stock.rejection_reason}")
        print()
    
    print("=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)
    
    return failed == 0

def test_rejection_reasons():
    """Test that rejection reasons are properly formatted"""
    
    print("\nREJECTION REASON TESTS")
    print("-" * 40)
    
    test_cases = [
        ('Flat rejection', 100.0, 100.2, 'continuation'),
        ('Gap down rejection', 100.0, 99.5, 'continuation'),
        ('Gap up rejection', 100.0, 101.0, 'reversal_s2'),
        ('Too high rejection', 100.0, 106.0, 'continuation'),
    ]
    
    for name, prev_close, open_price, situation in test_cases:
        stock = StockState('TEST', 'TEST', prev_close, situation)
        stock.open_price = open_price
        result = stock.validate_gap()
        
        print(f"{name}:")
        if not result:
            print(f"  Rejection reason: {stock.rejection_reason}")
        else:
            print(f"  Unexpectedly passed")
        print()

if __name__ == "__main__":
    success = test_gap_validation()
    test_rejection_reasons()
    
    if success:
        print("[OK] All tests passed!")
        sys.exit(0)
    else:
        print("[FAIL] Some tests failed!")
        sys.exit(1)