import { StockInfo } from "../types";
import { StateMachineMixin, StateMachineParams } from "./state-machine";

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
    this.stocks.set(instrumentKey, stock);
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
