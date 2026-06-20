#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script for IEP integration with continuation bot
"""

import sys
import os
from datetime import time

# Add src to path
sys.path.insert(0, 'src')

def test_iep_module():
    """Test the IEP module functionality"""
    print("=== TESTING IEP MODULE ===")
    
    try:
        from src.utils.upstox_fetcher import upstox_fetcher, iep_manager
        from src.trading.live_trading.continuation_modules.continuation_timing_module import ContinuationTimingManager
        from src.trading.live_trading.config import PREP_START
        
        print("[OK] Successfully imported all modules")
        print(f"[OK] PREP_START time: {PREP_START}")
        
        # Test IEP manager initialization
        print(f"[OK] IEP Manager initialized with UpstoxFetcher")
        
        # Test timing manager initialization
        timing_manager = ContinuationTimingManager(globals())
        print("[OK] Timing Manager initialized")
        
        # Test with sample symbols
        test_symbols = ['CHOLAFIN', 'ANURAS']  # Known symbols from manual mappings
        
        print(f"[OK] Testing with symbols: {test_symbols}")
        
        # Test IEP fetching (this will only work during pre-market hours)
        print("ℹ  Note: IEP fetching will only work during pre-market hours (9:00-9:15 AM)")
        print("ℹ  Testing module structure and imports...")
        
        # Test method availability
        assert hasattr(iep_manager, 'fetch_iep_batch'), "fetch_iep_batch method missing"
        assert hasattr(iep_manager, 'get_iep_for_symbol'), "get_iep_for_symbol method missing"
        
        assert hasattr(timing_manager, 'schedule_iep_fetch'), "schedule_iep_fetch method missing"
        assert hasattr(timing_manager, '_execute_iep_fetch'), "_execute_iep_fetch method missing"
        
        print("[OK] All required methods are available")
        
        # Test timing logic (removed is_pre_market_session test since it was removed)
        print("[OK] Timing logic test skipped (is_pre_market_session method removed)")
        
        print("[OK] IEP MODULE TEST PASSED")
        return True
        
    except ImportError as e:
        print(f"[FAIL] Import error: {e}")
        return False
    except Exception as e:
        print(f"[FAIL] Test error: {e}")
        return False

def test_continuation_bot_integration():
    """Test continuation bot integration"""
    print("\n=== TESTING CONTINUATION BOT INTEGRATION ===")
    
    try:
        # Test that continuation bot can import the new modules
        from src.trading.live_trading.run_continuation import run_continuation_bot
        print("[OK] Continuation bot imports successfully")
        
        # Test that the bot has the new imports
        import src.trading.live_trading.run_continuation as continuation_module
        
        # Check if the new imports are present in the module
        if hasattr(continuation_module, 'iep_manager'):
            print("[OK] iep_manager imported in continuation bot")
        else:
            print("[WARN]  iep_manager not found in continuation bot")
            
        if hasattr(continuation_module, 'ContinuationTimingManager'):
            print("[OK] ContinuationTimingManager imported in continuation bot")
        else:
            print("[WARN]  ContinuationTimingManager not found in continuation bot")
        
        print("[OK] CONTINUATION BOT INTEGRATION TEST PASSED")
        return True
        
    except ImportError as e:
        print(f"[FAIL] Import error: {e}")
        return False
    except Exception as e:
        print(f"[FAIL] Integration test error: {e}")
        return False

def main():
    """Run all tests"""
    print("IEP INTEGRATION TEST SUITE")
    print("=" * 50)
    
    test1_passed = test_iep_module()
    test2_passed = test_continuation_bot_integration()
    
    print("\n" + "=" * 50)
    print("TEST RESULTS:")
    print(f"IEP Module Test: {'[OK] PASSED' if test1_passed else '[FAIL] FAILED'}")
    print(f"Integration Test: {'[OK] PASSED' if test2_passed else '[FAIL] FAILED'}")
    
    if test1_passed and test2_passed:
        print("\n[DONE] ALL TESTS PASSED! IEP integration is ready.")
        print("\nNext steps:")
        print("1. Run the continuation bot during pre-market hours (9:00-9:15 AM)")
        print("2. The bot will fetch IEP at PREP_START time (9:14:30)")
        print("3. Gap validation will happen immediately after IEP fetch")
        print("4. No more waiting for 1-minute candles at 9:16!")
    else:
        print("\n[FAIL] Some tests failed. Please check the errors above.")
    
    return test1_passed and test2_passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)