import { StockStateEnum } from "../types";
import { ReversalStockState } from "./stock-monitor";

function parseTime(t: string): number {
  const parts = t.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export class ReversalTickProcessor {
  private stock: ReversalStockState;

  constructor(stock: ReversalStockState) {
    this.stock = stock;
  }

  processTick(price: number, timestamp: Date, ohlcList?: import("../types").OHLCData[]): void {
    // First merge I1 OHLC candle highs/lows (completeness via ltt) before tick price
    // This captures 359.40 even if ltp tick missed
    if (ohlcList && ohlcList.length > 0) {
      this.stock.processOHLC(ohlcList, timestamp);
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
    // Real-time low violation check using orbLow/firstOpen when available (OHLC truth)
    if (this.stock.openPrice !== null && !this.stock.lowViolationChecked) {
      const effectiveLow = this.stock.orbLow ?? this.stock.dailyLow;
      const effectiveOpen = this.stock.firstCandleOpen ?? this.stock.openPrice;
      const altLow = this.stock.dailyLow;
      const altOpen = this.stock.openPrice;
      const lowViolationPct = (effectiveOpen - effectiveLow) / effectiveOpen;
      const altViolationPct = (altOpen - altLow) / altOpen;
      if (
        lowViolationPct >= this.stock.params.lowViolationPct ||
        altViolationPct >= this.stock.params.lowViolationPct
      ) {
        this.stock.lowViolationChecked = true;
        if (this.stock.situation === "reversal_s1") {
          const violLow = lowViolationPct >= this.stock.params.lowViolationPct ? effectiveLow : altLow;
          const violThresh = lowViolationPct >= this.stock.params.lowViolationPct
            ? effectiveOpen * (1 - this.stock.params.lowViolationPct)
            : altOpen * (1 - this.stock.params.lowViolationPct);
          const pct = lowViolationPct >= this.stock.params.lowViolationPct ? lowViolationPct : altViolationPct;
          this.stock.reject(
            `Low violation: ${violLow.toFixed(2)} < ${violThresh.toFixed(2)} (${(pct * 100).toFixed(1)}% below)`,
          );
        }
      }
    }

    // EntryHigh ratchet disabled once orbFrozen (5-min ORB frozen at ENTRY_TIME)
    if (this.stock.situation === "reversal_s1" && this.stock.openPrice !== null) {
      if ((this.stock as any).orbFrozen) return;
      const newHigh = this.stock.orbHigh ?? this.stock.dailyHigh;
      const newSl = newHigh * (1 - this.stock.params.entrySlPct);
      if (this.stock.entryHigh === null || newHigh > this.stock.entryHigh) {
        this.stock.entryHigh = newHigh;
        this.stock.entrySl = newSl;
        // NOTE: entryReady is NOT set here — it must only be set by prepareEntry()
        // at ENTRY_TIME. This prevents premature entry before 09:20.
      }
    }
  }

  private handleEntryMonitoring(price: number, timestamp: Date): void {
    if (this.stock.entered || !this.stock.entryReady) return;

    // Defense-in-depth: don't enter before entry time (matches continuation pattern)
    const entryMinutes = this.stock.params.entryTime
      ? parseTime(this.stock.params.entryTime)
      : 9 * 60 + 20;
    const nowMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();
    if (nowMinutes < entryMinutes) return;

    if (this.stock.situation === "reversal_s2") {
      this.checkOopsEntry(price, timestamp);
    } else if (this.stock.situation === "reversal_s1") {
      this.checkStrongStartEntry(price, timestamp);
    }
  }

  private checkOopsEntry(price: number, timestamp: Date): void {
    if (this.stock.oopsTriggered || this.stock.entered) return;
    if (this.stock.openPrice === null || this.stock.previousClose === null) return;

    if (price >= this.stock.previousClose) {
      this.stock.oopsTriggered = true;
      // entryPrice already set to previousClose by prepareOops()
      // entrySl already set to previousClose * (1 - entrySlPct) by prepareOops()
      this.stock.enterPosition(price, timestamp);
    }
  }

  private checkStrongStartEntry(price: number, timestamp: Date): void {
    if (this.stock.strongStartTriggered || this.stock.entered) return;
    if (this.stock.openPrice === null || this.stock.previousClose === null) return;

    // Strict > required: tick must go BEYOND 5-min orbHigh, not touch (fixes HAPPSTMNDS 359.20 >= 359.20 false trigger vs 359.40)
    // entryHigh is frozen orbHigh at ENTRY_TIME when available
    if (this.stock.entryHigh !== null && price > this.stock.entryHigh) {
      this.stock.strongStartTriggered = true;
      console.log(`[${this.stock.symbol}] STRONG START BREAKOUT: price ${price.toFixed(2)} > entryHigh ${this.stock.entryHigh.toFixed(2)} (orbHigh ${this.stock.orbHigh?.toFixed(2) ?? "N/A"} dailyHigh ${this.stock.dailyHigh.toFixed(2)})`);
      this.stock.enterPosition(price, timestamp);
    }
  }

  private handleExitMonitoring(price: number, timestamp: Date): void {
    if (!this.stock.entered || this.stock.entryPrice === null) return;

    if (price <= this.stock.entrySl!) {
      this.stock.exitPosition(price, timestamp, "Stop Loss Hit");
    }
  }
}
