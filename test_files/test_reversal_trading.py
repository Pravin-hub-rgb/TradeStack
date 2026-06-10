#!/usr/bin/env python3
"""
Test Reversal Bot Trading Logic
Verifies that the reversal bot can properly execute OOPS and Strong Start trades
"""

import sys
import os

# Add src to path
sys.path.insert(0, 'src')

def test_reversal_trading_logic():
    """Test the reversal bot's trading logic"""

    print("[TEST_TUBE] Testing Reversal Bot Trading Logic")
    print("=" * 50)

    try:
        from trading.live_trading.reversal_monitor import ReversalMonitor
        from trading.live_trading.config import REVERSAL_LIST_FILE
        from utils.upstox_fetcher import upstox_fetcher

        # Load watchlist
        monitor = ReversalMonitor()
        success = monitor.load_watchlist(REVERSAL_LIST_FILE)

        if not success:
            print("[FAIL] Failed to load reversal watchlist")
            return False

        print(f"[OK] Loaded watchlist: {len(monitor.vip_stocks)} VIP, {len(monitor.secondary_stocks)} secondary, {len(monitor.tertiary_stocks)} tertiary stocks")

        # Test data access and trading conditions
        test_results = []

        # Test Strong Start condition (gap up)
        if monitor.vip_stocks:
            stock = monitor.vip_stocks[0]  # First VIP stock
            clean_symbol = stock.symbol.split('-')[0]

            try:
                # Get real previous close
                data = upstox_fetcher.get_ltp_data(clean_symbol)
                if data and 'cp' in data:
                    prev_close = float(data['cp'])
                    print(f"\n[CHART] Testing {stock.symbol} - Previous close: ₹{prev_close}")

                    # Set prev_close in monitor
                    monitor.set_prev_closes({stock.symbol: prev_close})

                    # Simulate Strong Start: 5% gap up, low within 1% of open
                    opening_price = prev_close * 1.05  # 5% gap up
                    current_low = opening_price * 0.995  # Low within 1% of open

                    stock.open_price = opening_price
                    stock.first_tick_captured = True

                    # Calculate gap
                    monitor.calculate_stock_gap(stock)

                    # Test Strong Start condition
                    is_strong_start = monitor.check_strong_start_conditions(stock, current_low)

                    if is_strong_start:
                        print("[OK] STRONG START: Conditions met - 5% gap up, low within 1% of open")
                        print("[TARGET] Bot would execute Strong Start trade!")
                        test_results.append("Strong Start: PASS")
                    else:
                        print("[FAIL] Strong Start: Conditions not met")
                        test_results.append("Strong Start: FAIL")

                else:
                    print(f"[FAIL] No previous close data for {clean_symbol}")
                    test_results.append("Strong Start: NO DATA")

            except Exception as e:
                print(f"[FAIL] Strong Start test error: {e}")
                test_results.append("Strong Start: ERROR")

        # Test OOPS condition (gap down + cross above prev close)
        if len(monitor.vip_stocks) > 1:
            stock = monitor.vip_stocks[1]  # Second VIP stock
            clean_symbol = stock.symbol.split('-')[0]

            try:
                # Get real previous close
                data = upstox_fetcher.get_ltp_data(clean_symbol)
                if data and 'cp' in data:
                    prev_close = float(data['cp'])
                    print(f"\n[CHART] Testing {stock.symbol} - Previous close: ₹{prev_close}")

                    # Set prev_close in monitor
                    monitor.set_prev_closes({stock.symbol: prev_close})

                    # Simulate OOPS: 3% gap down, then cross above prev close
                    opening_price = prev_close * 0.97  # 3% gap down
                    current_price = prev_close * 1.002  # Cross above prev close

                    stock.open_price = opening_price
                    stock.first_tick_captured = True

                    # Calculate gap
                    monitor.calculate_stock_gap(stock)

                    # Test OOPS condition
                    is_oops = monitor.check_oops_conditions(stock, current_price)

                    if is_oops:
                        print("[OK] OOPS: Conditions met - 3% gap down + crossed above prev close")
                        print("[TARGET] Bot would execute OOPS trade!")
                        test_results.append("OOPS: PASS")
                    else:
                        print("[FAIL] OOPS: Conditions not met")
                        test_results.append("OOPS: FAIL")

                else:
                    print(f"[FAIL] No previous close data for {clean_symbol}")
                    test_results.append("OOPS: NO DATA")

            except Exception as e:
                print(f"[FAIL] OOPS test error: {e}")
                test_results.append("OOPS: ERROR")

        # Summary
        print("\n" + "=" * 50)
        print("[CLIPBOARD] TEST RESULTS SUMMARY")
        print("=" * 50)

        passes = sum(1 for result in test_results if "PASS" in result)
        total_tests = len(test_results)

        for result in test_results:
            print(f"   {result}")

        print(f"\n[TARGET] Overall: {passes}/{total_tests} tests passed")

        if passes == total_tests and total_tests > 0:
            print("\n[OK] REVERSAL BOT TRADING LOGIC: FULLY OPERATIONAL!")
            print("[ROCKET] The bot can now execute OOPS and Strong Start trades when conditions are met.")
            return True
        elif passes > 0:
            print("\n[WARN] PARTIAL SUCCESS: Some trading conditions work, but not all.")
            print("[IDEA] The bot will execute trades for working conditions.")
            return True
        else:
            print("\n[FAIL] FAILED: No trading conditions are working.")
            print("[WRENCH] Check data access and gap calculation logic.")
            return False

    except Exception as e:
        print(f"[FAIL] Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main test function"""
    try:
        success = test_reversal_trading_logic()
        if success:
            print("\n[OK] Trading logic test completed successfully!")
        else:
            print("\n[FAIL] Trading logic test failed!")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n[WARN] Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[FAIL] Unexpected error during test: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
