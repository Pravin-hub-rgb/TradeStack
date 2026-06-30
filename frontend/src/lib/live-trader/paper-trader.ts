import { StockInfo, Trade, SessionStats } from "./types";

const PY_API = "http://127.0.0.1:8001";

export interface TradableStock {
  instrumentKey: string;
  symbol: string;
  getStatus(): StockInfo;
  entered: boolean;
  entryLogged: boolean;
  entryPrice: number | null;
  entryTime: Date | null;
  exitPrice: number | null;
  exitTime: Date | null;
  pnl: number | null;
  rejectionReason: string | null;
  entryHigh: number | null;
  entrySl: number | null;
  state: string;
}

export class PaperTrader {
  public trades: Trade[] = [];
  public initialCapital: number;
  public capital: number;
  public riskPerTrade: number;
  public entrySlPct: number;
  public realizedPnl = 0;
  private sessionId: string;
  private entryCount = 0;
  private winCount = 0;
  private lossCount = 0;

  constructor(initialCapital: number, riskPerTrade: number, entrySlPct: number, sessionId: string) {
    this.initialCapital = initialCapital;
    this.capital = initialCapital;
    this.riskPerTrade = riskPerTrade;
    this.entrySlPct = entrySlPct;
    this.sessionId = sessionId;
  }

  computeQuantity(entryPrice: number): number {
    const riskPerShare = entryPrice * this.entrySlPct;
    if (riskPerShare <= 0) return 1;
    return Math.max(1, Math.floor(this.riskPerTrade / riskPerShare));
  }

  computePositionCost(price: number, qty: number): number {
    return price * qty;
  }

  logEntry(stock: TradableStock, price: number, time: Date, tradeType: string): void {
    if (stock.entryLogged) return;
    stock.entryLogged = true;

    const qty = this.computeQuantity(price);
    const cost = this.computePositionCost(price, qty);

    if (cost > this.capital) {
      const msg = `INSUFFICIENT CAPITAL ${stock.symbol}: need ₹${cost.toFixed(0)}, have ₹${this.capital.toFixed(0)}`;
      console.log(`[PAPER] ${msg}`);
      (globalThis as any).__addLiveLog?.(`[Paper] ${msg}`);
      return;
    }

    this.capital -= cost;

    const trade: Trade = {
      id: `${this.sessionId}_${stock.symbol}_${this.entryCount + 1}`,
      symbol: stock.symbol,
      instrumentKey: stock.instrumentKey,
      entryPrice: price,
      entryTime: time,
      quantity: qty,
      side: "long",
      sessionId: this.sessionId,
      pnl: null,
      entryHigh: stock.entryHigh ?? undefined,
      entrySl: stock.entrySl ?? undefined,
      tradeType,
    };

    this.trades.push(trade);
    this.entryCount++;

    const entryMsg = `ENTRY ${stock.symbol} @ ${price.toFixed(2)} (qty: ${qty}, riskAmt: ${this.riskPerTrade})`;
    console.log(`[PAPER] ${entryMsg}`);
    (globalThis as any).__addLiveLog?.(`[Paper] ${entryMsg}`);

    fetch(`${PY_API}/api/trades/log-entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: stock.symbol,
        instrument_key: stock.instrumentKey,
        entry_price: price,
        entry_sl: stock.entrySl,
        entry_time: time.toISOString(),
        entry_date: time.toISOString().slice(0, 10),
        session_id: this.sessionId,
        trade_type: tradeType,
        quantity: qty,
      }),
    }).catch(() => {});
  }

  logExit(stock: TradableStock, price: number, time: Date, reason: string): void {
    const trade = this.trades.find(
      (t) => t.symbol === stock.symbol && t.exitPrice === null,
    );
    if (!trade) return;

    trade.exitPrice = price;
    trade.exitTime = time;
    trade.exitReason = reason;
    trade.pnl = (price - (trade.entryPrice ?? 0)) * trade.quantity;

    this.realizedPnl += trade.pnl;
    // available = initial + realized - remaining open positions
    const openCost = this.trades
      .filter(t => t.exitPrice === null)
      .reduce((sum, t) => sum + (t.entryPrice ?? 0) * t.quantity, 0);
    this.capital = this.initialCapital + this.realizedPnl - openCost;

    if (trade.pnl > 0) this.winCount++;
    else this.lossCount++;

    const exitMsg = `EXIT ${stock.symbol} @ ${price.toFixed(2)} (${reason}) PnL: ₹${trade.pnl.toFixed(2)}, capital: ₹${this.capital.toFixed(2)}`;
    console.log(`[PAPER] ${exitMsg}`);
    (globalThis as any).__addLiveLog?.(`[Paper] ${exitMsg}`);

    // Find existing open DB trade and set exit (no duplicate POST)
    fetch(`${PY_API}/api/trades/list`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }).then(r => r.json()).then(data => {
      const trades = data.trades || [];
      const existing = trades.find((t: any) => t.symbol === stock.symbol && !t.exit_price);
      if (existing) {
        fetch(`${PY_API}/api/trades/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exit_date: time.toISOString().slice(0, 10),
            exit_price: price,
          }),
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  getStats(): SessionStats {
    const totalTrades = this.trades.length;
    const completedTrades = this.trades.filter((t) => t.pnl !== null);

    return {
      sessionId: this.sessionId,
      totalTrades,
      completedTrades: completedTrades.length,
      wins: this.winCount,
      losses: this.lossCount,
      winRate: completedTrades.length > 0
        ? (this.winCount / completedTrades.length) * 100
        : 0,
      totalPnl: this.realizedPnl,
      averagePnl: completedTrades.length > 0 ? this.realizedPnl / completedTrades.length : 0,
      maxWin: completedTrades.length > 0
        ? Math.max(...completedTrades.map((t) => t.pnl ?? 0))
        : 0,
      maxLoss: completedTrades.length > 0
        ? Math.min(...completedTrades.map((t) => t.pnl ?? 0))
        : 0,
      capital: this.capital,
      initialCapital: this.initialCapital,
    };
  }

  getSummary(): string {
    const stats = this.getStats();
    return [
      `=== PAPER TRADER SUMMARY ===`,
      `Session: ${this.sessionId}`,
      `Total Trades: ${stats.totalTrades} (${stats.completedTrades} completed)`,
      `Wins: ${stats.wins}, Losses: ${stats.losses}`,
      `Win Rate: ${stats.winRate.toFixed(1)}%`,
      `Total P&L: ₹${this.realizedPnl.toFixed(2)}`,
      `Capital: ₹${this.capital.toFixed(2)}`,
      `========================`,
    ].join("\n");
  }
}
