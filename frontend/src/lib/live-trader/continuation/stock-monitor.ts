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

  processOHLC(ohlcList: OHLCData[]): void {
    for (const candle of ohlcList) {
      if (candle.interval === "I1") {
        if (candle.high > 0) this.dailyHigh = Math.max(this.dailyHigh, candle.high);
        if (candle.low > 0) this.dailyLow = Math.min(this.dailyLow, candle.low);
      }
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
    this.stocks.set(instrumentKey, stock);
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

    // Filter to I1 candles within 60s of MARKET_OPEN + 1 minute (matches old process_candle_data)
    const filtered: OHLCData[] = [];
    if (this.marketOpenTime) {
      const expectedTs = this.marketOpenTime.getTime() + 60000; // MARKET_OPEN + 1 min in ms
      const windowMs = 60000; // ±60 seconds
      for (const c of ohlcList) {
        if (c.interval === "I1" && c.ts > 0 && Math.abs(c.ts - expectedTs) <= windowMs) {
          filtered.push(c);
        }
      }
    }
    if (filtered.length > 0) {
      stock.processOHLC(filtered);
    }
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
