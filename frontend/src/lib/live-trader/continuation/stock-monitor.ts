import { StockInfo } from "../types";
import { ContinuationStateMachine, ContinuationStateMachineParams } from "./state-machine";
import { OHLCData } from "../types";

export class ContinuationStockState extends ContinuationStateMachine {
  public symbol: string;
  public instrumentKey: string;
  public previousClose: number;
  public situation = "continuation";
  public openPrice: number | null = null;
  public currentPrice: number | null = null;
  public dailyHigh = -Infinity;
  public dailyLow = Infinity;
  public lastUpdate: Date | null = null;
  public entryLogged = false;

  constructor(
    symbol: string,
    instrumentKey: string,
    previousClose: number,
    params: ContinuationStateMachineParams,
  ) {
    super(params);
    this.symbol = symbol;
    this.instrumentKey = instrumentKey;
    this.previousClose = previousClose;
  }

  updatePrice(price: number, timestamp: Date): void {
    this.currentPrice = price;
    this.dailyHigh = Math.max(this.dailyHigh, price);
    this.dailyLow = Math.min(this.dailyLow, price);
    this.lastUpdate = timestamp;
  }

  setOpenPrice(price: number): void {
    this.openPrice = price;
    this.dailyHigh = price;
    this.dailyLow = price;
  }

  /**
   * Simple I1 → ORB tracker (Option B). Called per-tick with Upstox I1 candles.
   * Mirrors reversal but without full CandleAggregator — just max high/min low for 5-min window.
   */
  processOHLC(ohlcList: OHLCData[]): void {
    if (!ohlcList || ohlcList.length === 0) return;
    const i1 = ohlcList.filter((c) => c.interval === "I1" && c.ts > 0);
    let earliest: OHLCData | null = null;
    let earliestTs = Infinity;
    for (const c of i1.slice(0, 5)) {
      const ts = c.ts > 1e12 ? c.ts : c.ts * 1000;
      const tsDate = new Date(ts);
      if (isNaN(tsDate.getTime())) continue;
      // Only consider candles at/after ORB start (09:15) if set
      const start = (this as any)._orbStartMinute as Date | null;
      const inWindow = !start || tsDate >= start;
      if (c.high > 0) {
        this.dailyHigh = Math.max(this.dailyHigh, c.high);
        if (inWindow && (this.orbHigh === null || c.high > this.orbHigh)) this.orbHigh = c.high;
      }
      if (c.low > 0) {
        this.dailyLow = Math.min(this.dailyLow, c.low);
        if (inWindow && (this.orbLow === null || c.low < this.orbLow)) this.orbLow = c.low;
      }
      if (inWindow && c.open > 0 && ts < earliestTs) {
        earliestTs = ts;
        earliest = c;
      }
    }
    if (earliest && (this as any)._firstTs === undefined) (this as any)._firstTs = Infinity;
    if (earliest && this.firstCandleOpen === null) {
      this.firstCandleOpen = earliest.open;
      (this as any)._firstTs = earliestTs;
    } else if (earliest && earliestTs < (this as any)._firstTs) {
      this.firstCandleOpen = earliest.open;
      (this as any)._firstTs = earliestTs;
    }
    if (earliestTs !== Infinity) {
      (this as any)._firstTs = Math.min((this as any)._firstTs as number, earliestTs);
    }
  }

  freezeOrb(): void {
    if (this.orbHigh !== null && this.orbHigh > 0) {
      this.orbFrozen = true;
      if (this.dailyHigh < this.orbHigh) this.dailyHigh = this.orbHigh;
      if (this.orbLow !== null && this.dailyLow > this.orbLow) this.dailyLow = this.orbLow;
    }
  }

  getStatus(): StockInfo {
    return {
      symbol: this.symbol,
      instrumentKey: this.instrumentKey,
      previousClose: this.previousClose,
      situation: this.situation,
      openPrice: this.openPrice,
      currentPrice: this.currentPrice,
      dailyHigh: this.dailyHigh,
      dailyLow: this.dailyLow,
      state: this.state,
      isActive: this.isActive,
      gapValidated: this.gapValidated,
      lowViolationChecked: this.lowViolationChecked,
      entryReady: this.entryReady,
      entered: this.entered,
      entryHigh: this.entryHigh,
      entrySl: this.entrySl,
      entryPrice: this.entryPrice,
      exitPrice: this.exitPrice,
      pnl: this.pnl,
      rejectionReason: this.rejectionReason,
      vahPrice: this.vahPrice,
      volumeBaseline: this.volumeBaseline,
      earlyVolume: this.earlyVolume,
      cumulativeVolume: this.cumulativeVolume,
      gapPct: this.gapPct,
      orbHigh: this.orbHigh,
      orbLow: this.orbLow,
      firstCandleOpen: this.firstCandleOpen,
    };
  }
}

export class StockMonitor {
  public stocks: Map<string, ContinuationStockState> = new Map();
  public sessionStartTime: Date | null = null;
  public marketOpenTime: Date | null = null;

  addStock(
    symbol: string,
    instrumentKey: string,
    previousClose: number,
    params: ContinuationStateMachineParams,
  ): void {
    if (this.stocks.has(instrumentKey)) return;
    const stock = new ContinuationStockState(symbol, instrumentKey, previousClose, params);
    try {
      let start: Date | null = this.marketOpenTime;
      if (!start) {
        const entryStr = params.entryTime ?? "09:20";
        const [eh, em] = entryStr.split(":").map(Number);
        const entryMin = eh * 60 + (em ?? 0);
        const openMin = entryMin - 5;
        const oh = Math.floor(openMin / 60);
        const om = openMin % 60;
        const today = new Date();
        today.setHours(oh, om, 0, 0);
        start = today;
      }
      const normalized = new Date(start);
      normalized.setSeconds(0, 0);
      stock.setOrbStartMinute(normalized);
    } catch {}
    this.stocks.set(instrumentKey, stock);
  }

  freezeOrb(): void {
    for (const stock of this.stocks.values()) {
      if (stock.isActive && (stock as any).orbHigh !== null) {
        stock.freezeOrb();
        console.log(`[ORB] ${stock.symbol} frozen orbHigh=${stock.orbHigh?.toFixed(2) ?? "N/A"} orbLow=${stock.orbLow?.toFixed(2) ?? "N/A"} firstOpen=${stock.firstCandleOpen?.toFixed(2) ?? "N/A"} dailyHigh=${stock.dailyHigh.toFixed(2)} dailyLow=${stock.dailyLow.toFixed(2)}`);
      }
    }
  }

  getActiveStocks(): ContinuationStockState[] {
    return Array.from(this.stocks.values()).filter((s) => s.isActive);
  }

  getQualifiedStocks(): ContinuationStockState[] {
    return Array.from(this.stocks.values()).filter(
      (s) => s.isActive && s.gapValidated && s.lowViolationChecked && s.volumeValidated,
    );
  }

  processCandleData(instrumentKey: string, ohlcList: OHLCData[]): void {
    const stock = this.stocks.get(instrumentKey);
    if (!stock || stock.situation !== "continuation") return;
    // Now just forwards all I1 — window filtering removed; processor path is primary.
    // Keep for backward compat: delegate to stock.processOHLC which handles orb window itself.
    stock.processOHLC(ohlcList);
  }

  checkViolations(): void {
    for (const stock of this.getActiveStocks()) {
      if (stock.gapValidated && !stock.lowViolationChecked && stock.openPrice !== null) {
        stock.checkLowViolation();
      }
    }
  }

  prepareEntries(): void {
    for (const stock of this.getQualifiedStocks()) {
      stock.prepareEntry();
    }
  }

  getSummary(): Record<string, unknown> {
    return {
      totalStocks: this.stocks.size,
      activeStocks: this.getActiveStocks().length,
      qualifiedStocks: this.getQualifiedStocks().length,
      enteredPositions: Array.from(this.stocks.values()).filter((s) => s.entered).length,
      stockDetails: Object.fromEntries(
        Array.from(this.stocks.entries()).map(([k, v]) => [k, v.getStatus()]),
      ),
    };
  }
}
