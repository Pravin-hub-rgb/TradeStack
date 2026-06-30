import { UpstoxStreamer } from "../streamer";
import { StockMonitor, ContinuationStockState } from "./stock-monitor";
import { ContinuationTickProcessor } from "./tick-processor";
import { ContinuationSubscriptionManager } from "./subscription-mgr";
import { PaperTrader } from "../paper-trader";
import { StockStateEnum, OHLCData } from "../types";

export class ContinuationIntegration {
  private streamer: UpstoxStreamer;
  private monitor: StockMonitor;
  private paperTrader: PaperTrader | null;
  private tickProcessors: Map<string, ContinuationTickProcessor> = new Map();
  private enteredCount = 0;
  private lastTickTs: Map<string, number> = new Map();
  subscriptionManager: ContinuationSubscriptionManager;

  private maxPositions: number;

  constructor(
    streamer: UpstoxStreamer,
    monitor: StockMonitor,
    paperTrader: PaperTrader | null = null,
    maxPositions = 2,
  ) {
    this.streamer = streamer;
    this.monitor = monitor;
    this.paperTrader = paperTrader;
    this.maxPositions = maxPositions;

    for (const stock of monitor.stocks.values()) {
      this.tickProcessors.set(
        stock.instrumentKey,
        new ContinuationTickProcessor(stock),
      );
    }

    this.subscriptionManager = new ContinuationSubscriptionManager(streamer, monitor);
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

    if (ohlcList) {
      this.monitor.processCandleData(instrumentKey, ohlcList);
    }

    const processor = this.tickProcessors.get(instrumentKey);
    if (!processor) return;

    processor.processTick(price, timestamp);
    this.handlePaperTradingLogs(stock, price, timestamp);
    this.checkAndUnsubscribeAfterPositionsFilled();
  }

  private handlePaperTradingLogs(
    stock: ContinuationStockState,
    price: number,
    timestamp: Date,
  ): void {
    if (
      stock.entered &&
      stock.entryTime &&
      Math.abs(stock.entryTime.getTime() - timestamp.getTime()) < 1000
    ) {
      this.paperTrader?.logEntry(stock, price, timestamp, "continuation");
      this.checkAndUnsubscribeAfterPositionsFilled();
    }

    if (
      stock.state === StockStateEnum.EXITED &&
      stock.exitTime &&
      Math.abs(stock.exitTime.getTime() - timestamp.getTime()) < 1000
    ) {
      this.paperTrader?.logExit(stock, price, timestamp, "Stop Loss Hit");
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
