#!/usr/bin/env python3
"""
Test script to verify main.py contains debugging code and is being used correctly
"""

import os
import time
from pathlib import Path

def test_main_py_debugging():
    """Test that main.py contains the debugging code we added"""

    print("[SEARCH] Testing main.py debugging code...")

    # Get main.py path
    main_py_path = Path("src/trading/live_trading/main.py")
    print(f"[FOLDER] Main.py path: {main_py_path.absolute()}")

    # Check if file exists
    if not main_py_path.exists():
        print("[FAIL] Main.py file not found!")
        return False

    # Get file info
    stat = main_py_path.stat()
    mtime = stat.st_mtime
    size = stat.st_size

    print(f"[CHART] File size: {size:,} bytes")
    print(f"[CLOCK3] Last modified: {time.ctime(mtime)}")

    # Read file content (handle encoding issues)
    try:
        with open(main_py_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        print(f"[FAIL] Error reading file: {e}")
        return False

    # Check for debugging markers
    debug_checks = [
        ("[DEBUG]", "DEBUG markers"),
        ("[REFRESH] STEP", "Step logging"),
        ("[OK] STEP", "Completion logging"),
        ("[FAIL] STEP", "Error logging"),
        ("prep_phase", "prep_phase method"),
        ("stock_scorer.preload_metadata", "metadata loading call")
    ]

    print("\n[SEARCH] Checking for debugging code...")

    all_passed = True
    for check_text, description in debug_checks:
        if check_text in content:
            print(f"[OK] Found: {description}")
        else:
            print(f"[FAIL] Missing: {description}")
            all_passed = False

    # Count occurrences
    debug_count = content.count("[DEBUG]")
    step_count = content.count("STEP")

    print(f"\n[TREND_UP] Counts:")
    print(f"   [DEBUG] markers: {debug_count}")
    print(f"   STEP references: {step_count}")

    # Check file structure
    lines = content.split('\n')
    total_lines = len(lines)
    print(f"   Total lines: {total_lines}")

    # Look for the prep_phase method
    prep_phase_found = False
    for i, line in enumerate(lines):
        if 'def prep_phase(self)' in line:
            prep_phase_found = True
            print(f"   prep_phase method starts at line {i+1}")
            break

    if not prep_phase_found:
        print("[FAIL] prep_phase method not found!")
        all_passed = False

    # Final result
    print(f"\n{'[DONE]' if all_passed else '[WARN]'}  Overall result: {'PASSED' if all_passed else 'FAILED'}")

    return all_passed

if __name__ == "__main__":
    success = test_main_py_debugging()
    exit(0 if success else 1)
