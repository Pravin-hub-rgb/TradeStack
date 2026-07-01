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
  private enteredCount = 0;
  private lastTickTs: Map<string, number> = new Map();
  subscriptionManager: SubscriptionManager;

  private maxPositions: number;

  constructor(
    streamer: UpstoxStreamer,
    monitor: ReversalStockMonitor,
    paperTrader: PaperTrader | null = null,
    maxPositions = 2,
  ) {
    this.streamer = streamer;
    this.monitor = monitor;
    this.paperTrader = paperTrader;
    this.maxPositions = maxPositions;

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
    this.checkAndUnsubscribeAfterPositionsFilled();
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
      this.checkAndUnsubscribeAfterPositionsFilled();
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

  private checkAndUnsubscribeAfterPositionsFilled(): void {
    this.enteredCount = 0;
    const subscribed: string[] = [];

    for (const stock of this.monitor.stocks.values()) {
      if (stock.isSubscribed) {
        subscribed.push(stock.instrumentKey);
        if (stock.entered) this.enteredCount++;
      }
    }

    if (this.enteredCount >= this.maxPositions && subscribed.length > this.maxPositions) {
      const remaining = Array.from(this.monitor.stocks.values()).filter(
        (s) => s.isSubscribed && !s.entered,
      );
      const remainingKeys = remaining.map((s) => s.instrumentKey);
      if (remainingKeys.length > 0) {
        for (const stock of remaining) stock.rejectionReason = "Not selected (max positions filled)";
        this.subscriptionManager.safeUnsubscribe(remainingKeys, "positions_filled");
        this.subscriptionManager.markStocksUnsubscribed(remainingKeys);
      }
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
