#!/usr/bin/env python3
"""
Process Jan 6 Bhavcopy CSV and Update ALL Stocks Cache
Reads the manually downloaded bhavcopy file and updates every stock with Jan 6 data
"""

import pandas as pd
from pathlib import Path
from datetime import date
from src.utils.cache_manager import cache_manager

def process_jan6_bhavcopy_csv():
    """Process the downloaded Jan 6 bhavcopy CSV and update all stocks"""

    print("[ROCKET] PROCESSING JAN 6 BHAVCOPY CSV - ALL STOCKS")
    print("=" * 60)

    # File path
    csv_file = Path("bhavcopy_cache/BhavCopy_NSE_CM_0_0_0_20260106_F_0000.csv")

    if not csv_file.exists():
        print(f"[FAIL] CSV file not found: {csv_file}")
        return

    print(f"[FOLDER] Processing file: {csv_file}")

    try:
        # Load the CSV file
        print("[BOOK] Loading CSV file...")
        df = pd.read_csv(csv_file)
        print(f"[OK] Loaded {len(df)} total records")

        # Show file info
        print("\n[CLIPBOARD] FILE ANALYSIS:")
        print(f"   Columns: {list(df.columns)}")
        print(f"   Sample data:")
        print(df.head(3))

        # Filter for equity stocks only
        print("\n[TARGET] FILTERING EQUITY STOCKS...")
        if 'SctySrs' in df.columns:
            equity_df = df[df['SctySrs'] == 'EQ']
            print(f"[OK] Found {len(equity_df)} equity stocks")
        else:
            print("[WARN]  SctySrs column not found, processing all records")
            equity_df = df

        if equity_df.empty:
            print("[FAIL] No equity stocks found in file")
            return

        # Get unique symbols
        symbols = equity_df['TckrSymb'].unique() if 'TckrSymb' in equity_df.columns else []
        print(f"[CHART] Unique equity symbols: {len(symbols)}")

        # Process date
        target_date = date(2026, 1, 6)
        print(f"[CALENDAR] Target date: {target_date}")

        # Process each stock individually
        print("\n[REFRESH] UPDATING CACHE FOR ALL STOCKS...")
        updated = 0
        skipped = 0
        failed = 0

        for i, symbol in enumerate(symbols):
            try:
                # Get this stock's data
                stock_data = equity_df[equity_df['TckrSymb'] == symbol] if 'TckrSymb' in equity_df.columns else equity_df[equity_df.index == i]

                if stock_data.empty:
                    skipped += 1
                    continue

                # Extract OHLCV data (UDiFF format)
                row = stock_data.iloc[0]

                # Map columns to our format
                ohlc_data = {
                    'date': target_date,
                    'open': row.get('OpnPric', row.get('OPEN_PRICE', 0)),
                    'high': row.get('HghPric', row.get('HIGH_PRICE', 0)),
                    'low': row.get('LwPric', row.get('LOW_PRICE', 0)),
                    'close': row.get('ClsPric', row.get('CLOSE_PRICE', 0)),
                    'volume': row.get('TtlTradgVol', row.get('TTL_TRD_QNTY', 0))
                }

                # Validate data
                if all(v > 0 for v in [ohlc_data['open'], ohlc_data['high'], ohlc_data['low'], ohlc_data['close']]):
                    # Create DataFrame
                    cache_df = pd.DataFrame([ohlc_data])
                    cache_df['date'] = pd.to_datetime(cache_df['date'])
                    cache_df.set_index('date', inplace=True)

                    # Update cache
                    cache_manager.update_with_bhavcopy(symbol, cache_df)

                    updated += 1

                    if updated % 200 == 0:
                        print(f"  [TREND_UP] Updated {updated} stocks...")

                else:
                    print(f"  [WARN]  Invalid data for {symbol}: {ohlc_data}")
                    skipped += 1

            except Exception as e:
                print(f"  [FAIL] Failed {symbol}: {str(e)[:50]}...")
                failed += 1

        print("\n[OK] CACHE UPDATE COMPLETE")
        print(f"   Updated: {updated} stocks")
        print(f"   Skipped: {skipped} stocks")
        print(f"   Failed: {failed} stocks")
        print(f"   Total processed: {updated + skipped + failed}")

        # Verification phase
        print("\n[SEARCH] VERIFYING ALL STOCKS HAVE JAN 6 DATA...")
        verified = verify_all_stocks_updated(symbols, target_date)

        if verified:
            print("[OK] VERIFICATION PASSED - All stocks updated successfully!")
            print("[DELETE]  Cleaning up CSV file...")
            csv_file.unlink()
            print("[OK] Cleanup complete!")
        else:
            print("[FAIL] VERIFICATION FAILED - Keeping CSV file for retry")
            print(f"[FLOPPY] File preserved at: {csv_file}")

        # Final summary
        print("\n[DONE] PROCESSING COMPLETE!")
        print(f"Stocks with Jan 6 data: {verified}")
        print(f"Total equity stocks processed: {len(symbols)}")

        # Show sample updated stocks
        if verified > 0:
            print("\n[CHART] SAMPLE UPDATED STOCKS:")
            sample_symbols = list(symbols)[:5] if len(symbols) >= 5 else symbols
            for symbol in sample_symbols:
                try:
                    stock_cache = cache_manager.load_cached_data(symbol)
                    if stock_cache is not None and not stock_cache.empty:
                        latest = stock_cache.index.max()
                        if latest.date() == target_date:
                            row = stock_cache.iloc[-1]
                            print(f"   {symbol}: O:{row['open']:.2f} H:{row['high']:.2f} L:{row['low']:.2f} C:{row['close']:.2f}")
                except:
                    pass

    except Exception as e:
        print(f"[FAIL] PROCESSING FAILED: {e}")
        print(f"[FLOPPY] CSV file preserved at: {csv_file}")

def verify_all_stocks_updated(symbols, target_date):
    """Verify that all stocks have been updated with target date data"""
    print(f"[SEARCH] Checking {len(symbols)} stocks for {target_date} data...")

    verified = 0
    target_timestamp = pd.Timestamp(target_date)

    for symbol in symbols:
        try:
            df = cache_manager.load_cached_data(symbol)
            if df is not None and target_timestamp in df.index:
                verified += 1
            else:
                print(f"  [FAIL] Missing: {symbol}")
        except:
            print(f"  [FAIL] Error checking: {symbol}")

    success_rate = verified / len(symbols) * 100
    print(f"[OK] Verification: {verified}/{len(symbols)} stocks have {target_date} data ({success_rate:.1f}%)")

    return verified == len(symbols)  # 100% success required

if __name__ == "__main__":
    process_jan6_bhavcopy_csv()