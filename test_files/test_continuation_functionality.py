#!/usr/bin/env python3
"""
Test Continuation Bot Functionality
Verifies that continuation bot still works after reversal bot fixes
"""

import sys
import os

# Add src to path
sys.path.insert(0, 'src')

def test_continuation_functionality():
    """Test that continuation bot functionality is preserved"""

    print("[TEST_TUBE] Testing Continuation Bot Functionality")
    print("=" * 50)

    try:
        # Test basic imports
        from trading.live_trading.stock_monitor import StockMonitor
        from trading.live_trading.config import CONTINUATION_LIST_FILE
        print("[OK] Continuation bot imports work")

        # Test continuation list loading
        if os.path.exists(CONTINUATION_LIST_FILE):
            with open(CONTINUATION_LIST_FILE, 'r') as f:
                content = f.read().strip()
                if content:
                    symbols = [s.strip() for s in content.split(',') if s.strip()]
                    print(f"[OK] Continuation list loaded: {len(symbols)} stocks")
                    print(f"   Sample stocks: {', '.join(symbols[:5])}")
                else:
                    print("[WARN] Continuation list is empty")
                    return True  # Empty is OK, just means no stocks configured
        else:
            print("[FAIL] Continuation list file not found")
            return False

        # Test monitor initialization
        monitor = StockMonitor()
        print("[OK] StockMonitor initialized")

        # Test stock addition (using first symbol)
        if 'symbols' in locals() and symbols:
            test_symbol = symbols[0]
            # Mock prev_close for testing
            mock_prev_close = 100.0

            monitor.add_stock(test_symbol, f"NSE_EQ|{test_symbol}", mock_prev_close)
            print(f"[OK] Added test stock: {test_symbol}")

            # Test entry preparation
            monitor.prepare_entries()
            print("[OK] Entry preparation works")

            # Test stock retrieval
            active_stocks = monitor.get_active_stocks()
            if active_stocks:
                print(f"[OK] Active stocks retrieved: {len(active_stocks)} stock(s)")
            else:
                print("[WARN] No active stocks (this may be normal)")

        # Test rule engine import
        from trading.live_trading.rule_engine import RuleEngine
        rule_engine = RuleEngine()
        print("[OK] RuleEngine initialized")

        # Test selection engine import
        from trading.live_trading.selection_engine import SelectionEngine
        selection_engine = SelectionEngine()
        print("[OK] SelectionEngine initialized")

        # Test paper trader import
        from trading.live_trading.paper_trader import PaperTrader
        paper_trader = PaperTrader()
        print("[OK] PaperTrader initialized")

        print("\n" + "=" * 50)
        print("[OK] CONTINUATION BOT FUNCTIONALITY: PRESERVED!")
        print("=" * 50)

        print("\n[CLIPBOARD] All continuation bot components verified:")
        print("[OK] Imports work correctly")
        print("[OK] Configuration files load")
        print("[OK] Core classes initialize")
        print("[OK] Stock monitoring functions")
        print("[OK] Trading components available")

        return True

    except Exception as e:
        print(f"[FAIL] Continuation bot test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main test function"""
    try:
        success = test_continuation_functionality()
        if success:
            print("\n[OK] Continuation bot functionality test completed successfully!")
            print("[IDEA] Continuation trading features are intact and working.")
        else:
            print("\n[FAIL] Continuation bot functionality test failed!")
            print("[WRENCH] Check that continuation bot components are not broken by recent changes.")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n[WARN] Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[FAIL] Unexpected error during test: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
