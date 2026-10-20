import { StockInfo, OHLCData } from "../types";
import { StateMachineMixin, StateMachineParams } from "./state-machine";
import { CandleAggregator } from "../candle-aggregator";

export class ReversalStockState extends StateMachineMixin {
  public symbol: string;
  public instrumentKey: string;
  public previousClose: number;
  public situation: ReversalSituation;
  public openPrice: number | null = null;
  public currentPrice: number | null = null;
  public dailyHigh = -Infinity;
  public dailyLow = Infinity;
  public lastUpdate: Date | null = null;
  public entryLogged = false;
  public declineDays: number;

  // OHLC-based ORB tracking (automatic via streamer, like option-trading-bot)
  public candleAggregator: CandleAggregator;
  public orbHigh: number | null = null;
  public orbLow: number | null = null;
  public firstCandleOpen: number | null = null;
  public orbFrozen = false;

  constructor(
    symbol: string,
    instrumentKey: string,
    previousClose: number,
    situation: ReversalSituation,
    params: StateMachineParams,
    declineDays = 0,
  ) {
    super(params);
    this.symbol = symbol;
    this.instrumentKey = instrumentKey;
    this.previousClose = previousClose;
    this.situation = situation;
    this.declineDays = declineDays;
    this.candleAggregator = new CandleAggregator(symbol);
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
   * Called per-tick with I1 OHLC list from Upstox full feed.
   * Mirrors option-trading-bot/data_streamer.py: process_ohlc_candles
   * Uses feedTime (ltt) to decide completeness, not wall clock.
   */
  processOHLC(ohlcList: OHLCData[] | undefined, feedTime: Date): void {
    if (!ohlcList || ohlcList.length === 0) return;
    const i1 = ohlcList
      .filter((c) => c.interval === "I1" && c.ts > 0)
      .sort((a, b) => b.ts - a.ts);
    // Keep track of earliest candle for firstCandleOpen
    let earliest: OHLCData | null = null;
    let earliestTs = Infinity;
    // Process latest 2 like option bot does, but allow up to 5 for ORB
    for (const c of i1.slice(0, 5)) {
      const tsMs = c.ts;
      // Upstox ts is in milliseconds (or seconds *1000). Handle both.
      const tsDate = new Date(tsMs > 1e12 ? tsMs : tsMs * 1000);
      // Skip invalid
      if (isNaN(tsDate.getTime())) continue;
      this.candleAggregator.updateFromOhlc(
        tsDate,
        c.open,
        c.high,
        c.low,
        c.close,
        feedTime
      );
      // Direct ORB tracking from I1 extremes (works even before aggregator commits)
      // This captures 359.40 even if ltp tick missed or history not yet finalized
      if (c.high > 0) {
        this.dailyHigh = Math.max(this.dailyHigh, c.high);
        // Only consider candles at or after startMinute for ORB
        const start = (this.candleAggregator as any).startMinute as Date | null;
        if (!start || tsDate >= start) {
          if (this.orbHigh === null || c.high > this.orbHigh) this.orbHigh = c.high;
        }
      }
      if (c.low > 0) {
        this.dailyLow = Math.min(this.dailyLow, c.low);
        const start = (this.candleAggregator as any).startMinute as Date | null;
        if (!start || tsDate >= start) {
          if (this.orbLow === null || c.low < this.orbLow) this.orbLow = c.low;
        }
      }
      const start = (this.candleAggregator as any).startMinute as Date | null;
      if (c.open > 0 && (!start || tsDate >= start)) {
        if (tsMs < earliestTs) {
          earliestTs = tsMs;
          earliest = c;
        }
      }
    }
    if (earliest && this.firstCandleOpen === null) {
      this.firstCandleOpen = earliest.open;
    } else if (earliest && earliestTs < (this as any)._firstTs) {
      this.firstCandleOpen = earliest.open;
    }
    (this as any)._firstTs = Math.min((this as any)._firstTs ?? Infinity, earliestTs);
    // Update orb values from aggregator history (more accurate once committed)
    this.refreshOrbFromHistory();
  }

  private refreshOrbFromHistory(): void {
    const hist = this.candleAggregator.getCandleHistory();
    if (hist.length === 0) return;
    // ORB window is all candles up to ENTRY_TIME, but aggregator already
    // filters by startMinute. We take max high / min low of history.
    const histHigh = Math.max(...hist.map((c) => c.high));
    const histLow = Math.min(...hist.map((c) => c.low));
    // Prefer committed history (authoritative), but keep max with direct
    if (this.orbHigh === null || histHigh > this.orbHigh) this.orbHigh = histHigh;
    if (this.orbLow === null || histLow < this.orbLow) this.orbLow = histLow;
    if (hist.length > 0) {
      // First candle open is the earliest in history (authoritative)
      const sorted = [...hist].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      this.firstCandleOpen = sorted[0].open;
    }
  }

  /**
   * Freeze ORB at ENTRY_TIME. Called from monitor.freezeOrb().
   * Sets entryHigh/entrySl from orbHigh (strong start only) if valid.
   */
  freezeOrb(): void {
    this.refreshOrbFromHistory();
    if (this.orbHigh !== null && this.orbHigh > 0) {
      this.orbFrozen = true;
      // If we have a valid ORB high and low, also sync dailyHigh/low for visibility
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

type ReversalSituation = "reversal_s1" | "reversal_s2";

const VIP_DECLINE_DAYS = 7;

function getReversalPriority(stock: ReversalStockState): number {
  const isVip = stock.declineDays >= VIP_DECLINE_DAYS;
  if (stock.situation === "reversal_s2") return isVip ? 1 : 2;
  return isVip ? 3 : 4;
}

export class ReversalStockMonitor {
  public stocks: Map<string, ReversalStockState> = new Map();
  public sessionStartTime: Date | null = null;
  public marketOpenTime: Date | null = null;

  addStock(
    symbol: string,
    instrumentKey: string,
    previousClose: number,
    situation: ReversalSituation,
    params: StateMachineParams,
    declineDays = 0,
  ): void {
    if (this.stocks.has(instrumentKey)) {
      console.warn(`Stock ${symbol} already monitored`);
      return;
    }
    const stock = new ReversalStockState(symbol, instrumentKey, previousClose, situation, params, declineDays);
    // Configure aggregator start minute like option bot does: MARKET_OPEN (09:15)
    // Prefer monitor.marketOpenTime if set (from orchestrator), else derive from ENTRY_TIME -5
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
      // Normalize to minute boundary
      const normalized = new Date(start);
      normalized.setSeconds(0, 0);
      stock.candleAggregator.setStartMinute(normalized);
    } catch {}
    this.stocks.set(instrumentKey, stock);
  }

  freezeOrb(): void {
    for (const stock of this.stocks.values()) {
      if (stock.isActive && stock.situation === "reversal_s1") {
        stock.freezeOrb();
        console.log(`[ORB] ${stock.symbol} frozen orbHigh=${stock.orbHigh?.toFixed(2) ?? "N/A"} orbLow=${stock.orbLow?.toFixed(2) ?? "N/A"} firstOpen=${stock.firstCandleOpen?.toFixed(2) ?? "N/A"} dailyHigh=${stock.dailyHigh.toFixed(2)} dailyLow=${stock.dailyLow.toFixed(2)}`);
      }
    }
  }

  getActiveStocks(): ReversalStockState[] {
    return Array.from(this.stocks.values()).filter((s) => s.isActive);
  }

  getQualifiedStocks(): ReversalStockState[] {
    const qualified: ReversalStockState[] = [];
    for (const stock of this.stocks.values()) {
      if (stock.situation === "reversal_s2" && stock.isActive && stock.gapValidated) {
        qualified.push(stock);
      } else if (
        stock.situation === "reversal_s1" &&
        stock.isActive &&
        stock.gapValidated &&
        stock.lowViolationChecked
      ) {
        qualified.push(stock);
      }
    }
    return qualified;
  }

  checkViolations(): void {
    for (const stock of this.getActiveStocks()) {
      if (stock.gapValidated && !stock.lowViolationChecked && stock.openPrice !== null) {
        stock.checkLowViolation();
      }
    }
  }

  prepareEntries(): void {
    this.checkViolations();
    const qualified = this.getQualifiedStocks();

    for (const stock of qualified) {
      stock.prepareEntry();
    }
  }

  selectStocks(maxPositions: number): { selected: ReversalStockState[]; rejectedSS: string[]; notSelected: string[] } {
    const qualified = this.getQualifiedStocks();
    if (qualified.length === 0) return { selected: [], rejectedSS: [], notSelected: [] };

    // Already-entered stocks (entered between MARKET_OPEN and ENTRY_TIME) occupy a slot —
    // never deselect them. Only consider non-entered candidates for remaining slots.
    const alreadyEntered = qualified.filter((s) => s.entered);
    const candidates = qualified.filter((s) => !s.entered);

    const sorted = [...candidates].sort(
      (a, b) => getReversalPriority(a) - getReversalPriority(b),
    );

    const hasOopsVip = qualified.some(
      (s) => s.situation === "reversal_s2" && s.declineDays >= VIP_DECLINE_DAYS,
    );

    const selected: ReversalStockState[] = [...alreadyEntered];
    const rejectedSS: string[] = [];
    const notSelected: string[] = [];

    for (const stock of sorted) {
      if (hasOopsVip && stock.situation === "reversal_s1") {
        rejectedSS.push(stock.instrumentKey);
        continue;
      }
      if (selected.length >= maxPositions) {
        notSelected.push(stock.instrumentKey);
        continue;
      }
      selected.push(stock);
    }

    const totalSkipped = rejectedSS.length + notSelected.length;
    const vipSelected = selected.filter((s) => s.declineDays >= VIP_DECLINE_DAYS).length;
    const normalSelected = selected.length - vipSelected;
    console.log(
      `[SELECT] Reversal: ${selected.length}/${qualified.length} selected` +
      ` (VIP: ${vipSelected}, Normal: ${normalSelected}, RejectedSS: ${rejectedSS.length}, NotSelected: ${notSelected.length})`,
    );
    return { selected, rejectedSS, notSelected };
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
