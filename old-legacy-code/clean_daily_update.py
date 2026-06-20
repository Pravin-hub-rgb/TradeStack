#!/usr/bin/env python3
"""
Clean Daily Update Script
Simple daily automation using the clean bhavcopy system
"""

from datetime import datetime
from src.utils.clean_daily_bhavcopy import update_daily_bhavcopy_clean

def main():
    """Clean daily update - download, check, cache, cleanup"""
    print("[CLOCK1] CLEAN DAILY BHAVCOPY UPDATE")
    print("=" * 50)
    print(f"Time: {datetime.now()}")
    print("Workflow: Download → Check → Cache → Cleanup")
    print()

    # Run the clean update
    result = update_daily_bhavcopy_clean()

    print("\n" + "=" * 50)
    print("[CHART] CLEAN UPDATE RESULTS:")

    status = result.get('status', 'UNKNOWN')
    print(f"Status: {status}")

    if 'latest_date' in result:
        print(f"Latest Date: {result['latest_date']}")

    if 'stocks_updated' in result:
        print(f"Stocks Updated: {result['stocks_updated']}")

    if 'stocks_skipped' in result:
        print(f"Stocks Skipped: {result['stocks_skipped']}")

    if 'duration_seconds' in result:
        print(f"Duration: {result['duration_seconds']:.1f} seconds")

    if 'verified' in result:
        print(f"Verified: {' Yes' if result['verified'] else '[FAIL] No'}")

    if 'message' in result:
        print(f"Message: {result['message']}")

    # Summary
    print("\n" + "=" * 30)
    if status == 'SUCCESS':
        print("[DONE] CLEAN UPDATE COMPLETED SUCCESSFULLY!")
        print(" Downloaded bhavcopy file")
        print(" Checked latest available data")
        print(" Cached only missing data")
        print(" Cleaned up temporary files")
    elif status == 'PARTIAL':
        print("[WARN]  PARTIAL SUCCESS")
        print("Some stocks may not have been updated")
    else:
        print("[FAIL] UPDATE FAILED")
        print("Check logs and NSE data availability")

    print("\n[IDEA] Ready for next daily run at 6 PM")

if __name__ == "__main__":
    main()