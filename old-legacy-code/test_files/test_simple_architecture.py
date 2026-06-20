#!/usr/bin/env python3
"""
Simple test script to verify the complete architectural separation
"""

import sys
import os

# Add current directory to path for imports
sys.path.append('src/trading/live_trading')

def test_simple_architecture():
    """Test the complete reversal architecture separation"""
    
    print("=== TESTING REVERSAL ARCHITECTURE SEPARATION ===")
    
    # Test 1: Import ReversalStockMonitor (should work)
    try:
        from reversal_stock_monitor import ReversalStockMonitor
        print("[OK] ReversalStockMonitor imported successfully")
    except ImportError as e:
        print(f"[FAIL] Failed to import ReversalStockMonitor: {e}")
        return False
    
    # Test 2: Import StockMonitor (should fail - not available in reversal system)
    try:
        from stock_monitor import StockMonitor
        print("[FAIL] StockMonitor should not be available in reversal system")
        return False
    except ImportError:
        print("[OK] StockMonitor correctly not available in reversal system")
    
    # Test 3: Create ReversalStockMonitor instance
    try:
        monitor = ReversalStockMonitor()
        print("[OK] ReversalStockMonitor instance created successfully")
    except Exception as e:
        print(f"[FAIL] Failed to create ReversalStockMonitor: {e}")
        return False
    
    # Test 4: Add stocks with different situations
    try:
        # Add OOPS stock (reversal_s2)
        monitor.add_stock("TEST_OOPS", "test_oops_key", 100.0, "reversal_s2")
        
        # Add Strong Start stock (reversal_s1)
        monitor.add_stock("TEST_SS", "test_ss_key", 100.0, "reversal_s1")
        
        print("[OK] Stocks added successfully with different situations")
    except Exception as e:
        print(f"[FAIL] Failed to add stocks: {e}")
        return False
    
    # Test 5: Test basic functionality without complex imports
    try:
        # Get the OOPS stock
        oops_stock = monitor.stocks["test_oops_key"]
        
        # Set opening price
        oops_stock.set_open_price(95.0)  # Gap down
        
        # Validate gap
        gap_valid = oops_stock.validate_gap()
        print(f"[OK] OOPS gap validation: {gap_valid}")
        
        # Test basic price tracking
        oops_stock.update_price(95.0, None)
        oops_stock.update_price(93.5, None)
        
        # Check if daily low was tracked
        if oops_stock.daily_low <= 93.5:
            print("[OK] Basic price tracking working")
        else:
            print("[FAIL] Basic price tracking not working")
            return False
            
    except Exception as e:
        print(f"[FAIL] Failed basic functionality test: {e}")
        return False
    
    # Test 6: Test Strong Start entry level tracking
    try:
        # Get the Strong Start stock
        ss_stock = monitor.stocks["test_ss_key"]
        
        # Set opening price
        ss_stock.set_open_price(105.0)  # Gap up
        
        # Validate gap
        gap_valid = ss_stock.validate_gap()
        print(f"[OK] Strong Start gap validation: {gap_valid}")
        
        # Test basic price tracking
        ss_stock.update_price(105.0, None)
        ss_stock.update_price(110.0, None)
        
        # Check if daily high was tracked
        if ss_stock.daily_high >= 110.0:
            print("[OK] Basic entry level tracking working")
        else:
            print(f"[FAIL] Basic entry level tracking not working: daily_high={ss_stock.daily_high}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Failed Strong Start entry level test: {e}")
        return False
    
    # Test 7: Test utility methods
    try:
        # Test get_subscribed_symbols
        symbols = monitor.get_subscribed_symbols()
        print(f"[OK] get_subscribed_symbols: {symbols}")
        
        # Test get_low_violation_stocks
        low_violations = monitor.get_low_violation_stocks()
        print(f"[OK] get_low_violation_stocks: {len(low_violations)} stocks")
        
    except Exception as e:
        print(f"[FAIL] Failed utility methods test: {e}")
        return False
    
    print("\n=== ALL TESTS PASSED ===")
    print("[OK] Reversal architecture separation is working correctly")
    print("[OK] Basic price tracking is working")
    print("[OK] Basic entry level tracking is working")
    print("[OK] No dependencies on StockMonitor in reversal system")
    
    return True

def test_integration():
    """Test the integration without complex imports"""
    
    print("\n=== TESTING INTEGRATION ===")
    
    try:
        from reversal_modules.integration import ReversalIntegration
        from simple_data_streamer import SimpleStockStreamer
        from reversal_stock_monitor import ReversalStockMonitor
        from paper_trader import PaperTrader
        
        # Create components
        monitor = ReversalStockMonitor()
        streamer = SimpleStockStreamer([], {})
        paper_trader = PaperTrader()
        
        # Create integration
        integration = ReversalIntegration(streamer, monitor, paper_trader)
        
        print("[OK] Integration created successfully")
        
        return True
        
    except Exception as e:
        print(f"[FAIL] Integration test failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing Reversal Bot Architectural Separation")
    print("=" * 50)
    
    # Run tests
    architecture_test = test_simple_architecture()
    integration_test = test_integration()
    
    if architecture_test and integration_test:
        print("\n[DONE] ALL TESTS PASSED! [DONE]")
        print("The reversal bot architectural separation is complete and working correctly.")
        sys.exit(0)
    else:
        print("\n[FAIL] SOME TESTS FAILED")
        print("Please check the implementation and fix any issues.")
        sys.exit(1)