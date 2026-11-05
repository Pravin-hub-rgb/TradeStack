"""Diagnostic: recompute SMA20 from raw close and check the rising-MA gate for a symbol."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from src.cache_manager import cache_manager
from src.indicators import compute_all_indicators

symbol = sys.argv[1] if len(sys.argv) > 1 else "JWL"
params = {"sma_period": 20, "rising_ma_prev_max_window": 5, "rising_ma_tolerance": 0.0}

data = cache_manager.load(symbol)
if data is None or data.empty:
    print(f"No cached data for {symbol}")
    sys.exit(1)

ind = compute_all_indicators(data, indicator_params={"sma_period": 20, "adr_period": 14,
    "high_low_period": 20, "ma_angle_points": 5, "price_change_periods": [1, 5, 20]})
sma = ind["sma_20"]
window = 5
prev_max = sma.shift(1).rolling(window).max()
rising = sma >= prev_max * (1 - params["rising_ma_tolerance"] / 100)

print(f"{symbol}: {len(data)} rows, {data.index.min().date()} -> {data.index.max().date()}")
print("Columns after load (raw only):", list(data.columns))
print("\nLast 10 SMA20 + gate:")
out = pd.DataFrame({"close": data["close"], "SMA20": sma, "prev5max": prev_max, "Rising_MA": rising})
print(out.tail(10).to_string())
print("\nGate result (latest):", bool(rising.iloc[-1]))
