import { OHLCData, StockStateEnum } from "../types";
import { ContinuationStockState } from "./stock-monitor";

function parseTime(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export class ContinuationTickProcessor {
  private stock: ContinuationStockState;

  constructor(stock: ContinuationStockState) {
    this.stock = stock;
  }

  processTick(price: number, timestamp: Date, ohlcList?: OHLCData[]): void {
    // OHLC first — captures 5-min high/low even if LTP miss (like reversal fix)
    if (ohlcList && ohlcList.length > 0) {
      this.stock.processOHLC(ohlcList);
    }
    this.stock.updatePrice(price, timestamp);

    if (this.stock.isActive) {
      this.trackEntryLevels(price, timestamp);
    }

    if (this.stock.state === StockStateEnum.WAITING_FOR_ENTRY) {
      this.handleEntryMonitoring(price, timestamp);
    } else if (this.stock.state === StockStateEnum.ENTERED) {
      this.handleExitMonitoring(price, timestamp);
    }
  }

  private trackEntryLevels(price: number, timestamp: Date): void {
    // If ORB frozen at ENTRY_TIME, don't ratchet — entryHigh locked to orbHigh
    if (this.stock.orbFrozen) return;
    // Before freeze, track from dailyHigh (which now includes I1 candle highs)
    if (this.stock.dailyHigh > 0) {
      const newHigh = this.stock.dailyHigh;
      const newSl = newHigh * (1 - this.stock.params.entrySlPct);
      if (this.stock.entryHigh === null || newHigh !== this.stock.entryHigh || newSl !== this.stock.entrySl) {
        this.stock.entryHigh = newHigh;
        this.stock.entrySl = newSl;
      }
    }

    // Auto-flag entryReady when entry time is reached (matches old entry_time_reached pattern)
    if (!this.stock.entryReady && !this.stock.entered) {
      const entryMinutes = this.stock.params.entryTime
        ? parseTime(this.stock.params.entryTime)
        : 9 * 60 + 20;
      const nowMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();
      if (nowMinutes >= entryMinutes) {
        this.stock.entryReady = true;
      }
    }
  }

  private handleEntryMonitoring(price: number, timestamp: Date): void {
    if (!this.stock.isActive || this.stock.entered || !this.stock.entryReady) return;
    if (this.stock.entryHigh === null) return;

    // Defense-in-depth: don't enter before entry time (matches old 3-gate pattern)
    const entryMinutes = this.stock.params.entryTime
      ? parseTime(this.stock.params.entryTime)
      : 9 * 60 + 20;
    const nowMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();
    if (nowMinutes < entryMinutes) return;

    // Strict > required: must break above ORB high, not touch (like reversal HAPPSTMNDS fix)
    if (price > this.stock.entryHigh) {
      console.log(`[${this.stock.symbol}] BREAKOUT: price ${price.toFixed(2)} > entryHigh ${this.stock.entryHigh.toFixed(2)} (orbHigh ${this.stock.orbHigh?.toFixed(2) ?? "N/A"} dailyHigh ${this.stock.dailyHigh.toFixed(2)})`);
      this.stock.enterPosition(price, timestamp);
    } else {
      console.log(`[${this.stock.symbol}] HOLD: price ${price.toFixed(2)} <= entryHigh ${this.stock.entryHigh.toFixed(2)} (need >)`);
    }
  }

  private handleExitMonitoring(price: number, timestamp: Date): void {
    if (!this.stock.entered || this.stock.entryPrice === null) return;

    // No trailing SL — entrySl stays fixed at 4% below the entry point from the window
    if (this.stock.entrySl !== null && price <= this.stock.entrySl) {
      this.stock.exitPosition(price, timestamp, "Stop Loss Hit");
    }
  }
}
