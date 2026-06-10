#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick SVRO Test - Fast test to validate core SVRO functionality
Tests the essential SVRO conditions without full market data dependencies
"""

import sys
import os
import time
from datetime import datetime
import logging

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.trading.live_trading.continuation_stock_monitor import StockMonitor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('svro_quick_test.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('SVROQuickTest')


def test_svro_core_logic():
    """Test the core SVRO logic with synthetic data"""
    print("[TEST_TUBE] Quick SVRO Core Logic Test")
    print("=" * 50)
    print("Testing: Essential SVRO conditions with synthetic data")
    print("Focus: Volume, gap, and low violation validation")
    print()

    monitor = StockMonitor()
    
    # Test stock setup
    test_stock = {
        'symbol': 'TEST_SVRO',
        'instrument_key': 'TEST_SVRO_KEY',
        'previous_close': 100.0,
        'open_price': 102.0,  # 2% gap up
        'volume_baseline': 1000000.0  # 1M baseline
    }

    # Add stock to monitor
    monitor.add_stock(
        symbol=test_stock['symbol'],
        instrument_key=test_stock['instrument_key'],
        previous_close=test_stock['previous_close'],
        situation='continuation'
    )

    # Set opening price and volume baseline
    stock = monitor.stocks[test_stock['instrument_key']]
    stock.set_open_price(test_stock['open_price'])
    stock.volume_baseline = test_stock['volume_baseline']

    print(f"Test Stock Setup:")
    print(f"  Symbol: {test_stock['symbol']}")
    print(f"  Previous Close: {test_stock['previous_close']:.2f}")
    print(f"  Open Price: {test_stock['open_price']:.2f}")
    print(f"  Gap: {((test_stock['open_price'] - test_stock['previous_close']) / test_stock['previous_close'] * 100):+.1f}%")
    print(f"  Volume Baseline: {test_stock['volume_baseline']:,.0f}")
    print()

    # Test scenarios
    test_scenarios = [
        {
            'name': 'SVRO Easy Pass',
            'gap_pct': 0.02,  # 2% gap up
            'volume_ratio': 0.10,  # 10% volume
            'price_pattern': 'steady_up',
            'expected_pass': True,
            'reason': 'All conditions met'
        },
        {
            'name': 'SVRO Volume Fail',
            'gap_pct': 0.03,  # 3% gap up
            'volume_ratio': 0.05,  # 5% volume (below 7.5%)
            'price_pattern': 'steady_up',
            'expected_pass': False,
            'reason': 'Volume below 7.5% threshold'
        },
        {
            'name': 'SVRO Low Violation',
            'gap_pct': 0.02,  # 2% gap up
            'volume_ratio': 0.10,  # 10% volume
            'price_pattern': 'low_violation',
            'expected_pass': False,
            'reason': 'Price drops below 1% threshold'
        },
        {
            'name': 'SVRO Gap Boundary',
            'gap_pct': 0.003,  # 0.3% gap (minimum)
            'volume_ratio': 0.08,  # 8% volume
            'price_pattern': 'steady_up',
            'expected_pass': True,
            'reason': 'At gap boundary, volume sufficient'
        }
    ]

    results = []

    for scenario in test_scenarios:
        print(f"[TEST_TUBE] Testing: {scenario['name']}")
        print(f"   Gap: {scenario['gap_pct']*100:.1f}%, Volume: {scenario['volume_ratio']*100:.1f}%")
        print(f"   Expected: {'PASS' if scenario['expected_pass'] else 'FAIL'}")

        # Reset stock state
        stock.daily_high = test_stock['open_price']
        stock.daily_low = test_stock['open_price']
        stock.early_volume = 0
        stock.gap_validated = False
        stock.low_violation_checked = False
        stock.volume_validated = False
        stock.entry_ready = False
        stock.is_active = True
        stock.rejection_reason = None

        # Set opening price for this scenario
        scenario_open_price = test_stock['previous_close'] * (1 + scenario['gap_pct'])
        stock.set_open_price(scenario_open_price)

        # Simulate volume accumulation
        target_volume = test_stock['volume_baseline'] * scenario['volume_ratio']
        ticks_needed = 100
        volume_per_tick = target_volume / ticks_needed

        # Simulate price action and volume
        violation_detected = False
        entry_triggered = False

        for tick in range(ticks_needed):
            # Generate price based on pattern
            if scenario['price_pattern'] == 'steady_up':
                price = scenario_open_price + (tick * 0.05)
            elif scenario['price_pattern'] == 'low_violation':
                if tick < 20:
                    price = scenario_open_price + (tick * 0.05)
                else:
                    # Drop below 1% threshold
                    threshold = scenario_open_price * 0.99
                    price = threshold - ((tick - 20) * 0.02)
            else:
                price = scenario_open_price + (tick * 0.05)

            # Update volume
            stock.early_volume += volume_per_tick

            # Update price
            timestamp = datetime.now()
            stock.update_price(price, timestamp)

            # Check validations
            if not stock.gap_validated:
                stock.validate_gap()

            if stock.gap_validated and not stock.low_violation_checked:
                stock.check_low_violation()
                if stock.rejection_reason and 'Low violation' in stock.rejection_reason:
                    violation_detected = True

            if (stock.low_violation_checked and not stock.volume_validated and 
                stock.early_volume >= (test_stock['volume_baseline'] * 0.075)):
                stock.validate_volume(test_stock['volume_baseline'])

            # Check if ready for entry
            if stock.volume_validated and not stock.entry_ready:
                stock.prepare_entry()

            # Check entry trigger
            if stock.entry_ready and not stock.entered:
                if stock.check_entry_signal(price):
                    stock.enter_position(price, timestamp)
                    entry_triggered = True

        # Determine result
        qualified = (stock.gap_validated and stock.low_violation_checked and 
                    stock.volume_validated and stock.entry_ready)
        
        passed = qualified == scenario['expected_pass']

        result = {
            'scenario': scenario['name'],
            'expected_pass': scenario['expected_pass'],
            'actual_pass': qualified,
            'passed': passed,
            'gap_validated': stock.gap_validated,
            'low_violation_checked': stock.low_violation_checked,
            'volume_validated': stock.volume_validated,
            'entry_ready': stock.entry_ready,
            'violation_detected': violation_detected,
            'entry_triggered': entry_triggered,
            'rejection_reason': stock.rejection_reason,
            'final_volume': stock.early_volume,
            'final_volume_ratio': stock.early_volume / test_stock['volume_baseline']
        }

        results.append(result)

        status = "[OK] PASS" if passed else "[FAIL] FAIL"
        print(f"   {status} Expected: {'PASS' if scenario['expected_pass'] else 'FAIL'}, Got: {'PASS' if qualified else 'FAIL'}")
        if not passed:
            print(f"      Reason: {stock.rejection_reason if stock.rejection_reason else 'Unknown'}")
        print()

    return results


def print_test_summary(results):
    """Print test summary"""
    print("=" * 60)
    print("SVRO QUICK TEST SUMMARY")
    print("=" * 60)

    passed_count = sum(1 for r in results if r['passed'])
    total_count = len(results)

    print(f"Total Tests: {total_count}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {total_count - passed_count}")
    print(f"Success Rate: {passed_count/total_count*100:.1f}%")
    print()

    print("Detailed Results:")
    for result in results:
        status = "[OK] PASS" if result['passed'] else "[FAIL] FAIL"
        print(f"  {status} {result['scenario']}")
        print(f"     Expected: {'PASS' if result['expected_pass'] else 'FAIL'}")
        print(f"     Actual: {'PASS' if result['actual_pass'] else 'FAIL'}")
        print(f"     Gap: {'[OK]' if result['gap_validated'] else '[FAIL]'}")
        print(f"     Low Violation: {'[OK]' if result['low_violation_checked'] else '[FAIL]'}")
        print(f"     Volume: {'[OK]' if result['volume_validated'] else '[FAIL]'} ({result['final_volume_ratio']:.1%})")
        print(f"     Entry Ready: {'[OK]' if result['entry_ready'] else '[FAIL]'}")
        if result['rejection_reason']:
            print(f"     Rejection: {result['rejection_reason']}")
        print()

    # Critical validation
    print("[TARGET] CRITICAL SVRO VALIDATION:")
    
    # Volume threshold test
    volume_test = next((r for r in results if 'Volume Fail' in r['scenario']), None)
    if volume_test and volume_test['passed']:
        print("  [OK] Volume threshold (7.5%) validation working")
    else:
        print("  [FAIL] Volume threshold (7.5%) validation failed")

    # Gap threshold test
    gap_test = next((r for r in results if 'Gap Boundary' in r['scenario']), None)
    if gap_test and gap_test['passed']:
        print("  [OK] Gap threshold (0.3%) validation working")
    else:
        print("  [FAIL] Gap threshold (0.3%) validation failed")

    # Low violation test
    low_test = next((r for r in results if 'Low Violation' in r['scenario']), None)
    if low_test and low_test['passed']:
        print("  [OK] Low violation detection working")
    else:
        print("  [FAIL] Low violation detection failed")

    # Easy pass test
    easy_test = next((r for r in results if 'Easy Pass' in r['scenario']), None)
    if easy_test and easy_test['passed']:
        print("  [OK] Normal SVRO conditions working")
    else:
        print("  [FAIL] Normal SVRO conditions failed")

    success = passed_count == total_count
    print("\n" + "=" * 60)
    if success:
        print("[DONE] SVRO QUICK TEST PASSED!")
        print("Core SVRO functionality is working correctly.")
        print("Ready to test with real market data.")
    else:
        print("[FAIL] SVRO QUICK TEST FAILED!")
        print("Core SVRO functionality has issues.")
        print("Review and fix before proceeding.")

    return success


def main():
    """Main test runner"""
    results = test_svro_core_logic()
    success = print_test_summary(results)
    return success


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)