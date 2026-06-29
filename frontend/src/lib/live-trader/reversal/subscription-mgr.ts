import { UpstoxStreamer } from "../streamer";
import { ReversalStockMonitor, ReversalStockState } from "./stock-monitor";
import { StockStateEnum } from "../types";

export class SubscriptionManager {
  private streamer: UpstoxStreamer;
  private monitor: ReversalStockMonitor;

  constructor(streamer: UpstoxStreamer, monitor: ReversalStockMonitor) {
    this.streamer = streamer;
    this.monitor = monitor;
  }

  safeUnsubscribe(keys: string[], reason: string): void {
    if (keys.length === 0) return;
    const names = keys.map(k => this.monitor.stocks.get(k)?.symbol || k).join(", ");
    console.log(`[${reason}] Unsubscribing: ${names}`);
    try {
      this.streamer.unsubscribe(keys);
    } catch (e: any) {
      console.warn(`[UNSUBSCRIBE] Failed: ${names} (${reason}): ${e.message}`);
    }
  }

  markStocksUnsubscribed(keys: string[]): void {
    for (const key of keys) {
      const stock = this.monitor.stocks.get(key);
      if (stock) {
        stock.isSubscribed = false;
        stock.isActive = false;
        stock.state = StockStateEnum.UNSUBSCRIBED;
      }
    }
  }

  unsubscribeLowViolated(): void {
    this.monitor.checkViolations();
    const rejected: string[] = [];
    for (const [key, stock] of this.monitor.stocks) {
      if (stock.state === StockStateEnum.REJECTED && stock.isSubscribed) {
        rejected.push(key);
      }
    }
    if (rejected.length > 0) {
      this.safeUnsubscribe(rejected, "low_violation");
      this.markStocksUnsubscribed(rejected);
    }
  }

  markSelected(stocks: ReversalStockState[]): void {
    for (const stock of stocks) {
      if (stock.entered) continue;
      if (stock.state === StockStateEnum.WAITING_FOR_ENTRY) continue;
      stock.markSelected();
    }
  }

  logStatus(): void {
    const byState = new Map<string, string[]>();
    for (const stock of this.monitor.stocks.values()) {
      const s = stock.state;
      if (!byState.has(s)) byState.set(s, []);
      byState.get(s)!.push(stock.symbol);
    }

    for (const [state, symbols] of byState) {
      console.log(`  ${state.toUpperCase()}: ${symbols.length} stocks - ${symbols.join(", ")}`);
    }

    const subscribed = Array.from(this.monitor.stocks.values()).filter((s) => s.isSubscribed);
    console.log(`\nACTIVELY SUBSCRIBED: ${subscribed.length} stocks - ${subscribed.map((s) => s.symbol).join(", ")}`);
  }
}
