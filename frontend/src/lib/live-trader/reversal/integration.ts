import { UpstoxStreamer } from "../streamer";
import { ReversalStockMonitor, ReversalStockState } from "./stock-monitor";
import { ReversalTickProcessor } from "./tick-processor";
import { SubscriptionManager } from "./subscription-mgr";
import { PaperTrader } from "../paper-trader";
import { TradableStock } from "../paper-trader";
import { StockStateEnum, OHLCData } from "../types";

export class ReversalIntegration {
  private streamer: UpstoxStreamer;
  private monitor: ReversalStockMonitor;
  private paperTrader: PaperTrader | null;
  private tickProcessors: Map<string, ReversalTickProcessor> = new Map();
  private lastTickTs: Map<string, number> = new Map();
  subscriptionManager: SubscriptionManager;

  constructor(
    streamer: UpstoxStreamer,
    monitor: ReversalStockMonitor,
    paperTrader: PaperTrader | null = null,
    maxPositions = 2,
  ) {
    this.streamer = streamer;
    this.monitor = monitor;
    this.paperTrader = paperTrader;

    this.subscriptionManager = new SubscriptionManager(streamer, monitor);

    for (const stock of monitor.stocks.values()) {
      this.tickProcessors.set(
        stock.instrumentKey,
        new ReversalTickProcessor(stock),
      );
    }
  }

  simplifiedTickHandler(
    instrumentKey: string,
    symbol: string,
    price: number,
    timestamp: Date,
    ohlcList?: OHLCData[],
  ): void {
    const stock = this.monitor.stocks.get(instrumentKey);
    if (!stock || !stock.isSubscribed) return;

    const lastTs = this.lastTickTs.get(instrumentKey);
    if (lastTs !== undefined && timestamp.getTime() <= lastTs) return;
    this.lastTickTs.set(instrumentKey, timestamp.getTime());

    const processor = this.tickProcessors.get(instrumentKey);
    if (!processor) return;

    processor.processTick(price, timestamp);
    this.handlePaperTradingLogs(stock, price, timestamp);
  }

  private handlePaperTradingLogs(
    stock: ReversalStockState,
    price: number,
    timestamp: Date,
  ): void {
    if (
      stock.entered &&
      stock.entryTime &&
      Math.abs(stock.entryTime.getTime() - timestamp.getTime()) < 1000
    ) {
      const tradeType = stock.situation === "reversal_s2" ? "reversal_oops" : "reversal_ss";
      this.paperTrader?.logEntry(stock, price, timestamp, tradeType);
    }

    if (
      stock.state === StockStateEnum.EXITED &&
      stock.exitTime &&
      Math.abs(stock.exitTime.getTime() - timestamp.getTime()) < 1000
    ) {
      this.paperTrader?.logExit(stock, price, timestamp, "Stop Loss Hit");
      // Immediately unsubscribe the exited stock from WebSocket feed
      this.subscriptionManager.safeUnsubscribe([stock.instrumentKey], "exit");
      this.subscriptionManager.markStocksUnsubscribed([stock.instrumentKey]);
    }
  }

  cleanup(): void {
    const subscribedKeys: string[] = [];
    for (const [key, stock] of this.monitor.stocks) {
      if (stock.isSubscribed) subscribedKeys.push(key);
    }
    if (subscribedKeys.length > 0) {
      this.subscriptionManager.safeUnsubscribe(subscribedKeys, "end_of_day");
      this.subscriptionManager.markStocksUnsubscribed(subscribedKeys);
    }
    this.subscriptionManager.logStatus();
  }
}
