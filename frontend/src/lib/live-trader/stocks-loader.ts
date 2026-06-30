import { LiveTraderConfig, ScannerResult, ScannerStock, ReversalSituation } from "./types";
import { ReversalStockMonitor } from "./reversal/stock-monitor";
import { ReversalIntegration } from "./reversal/integration";
import { StockMonitor as ContinuationStockMonitor } from "./continuation/stock-monitor";
import { ContinuationIntegration } from "./continuation/integration";
import { PaperTrader } from "./paper-trader";
import { UpstoxStreamer } from "./streamer";

export interface LoadResult {
  reversalIntegration: ReversalIntegration | null;
  continuationIntegration: ContinuationIntegration | null;
}

export function loadStocksFromScanner(
  mode: "reversal" | "continuation",
  config: LiveTraderConfig,
  streamer: UpstoxStreamer,
  paperTrader: PaperTrader | null,
  reversalMonitor: ReversalStockMonitor,
  continuationMonitor: ContinuationStockMonitor,
  scannerResult: ScannerResult,
  log: (msg: string) => void,
): LoadResult {
  let reversalIntegration: ReversalIntegration | null = null;
  let continuationIntegration: ContinuationIntegration | null = null;
  const instrumentKeys: string[] = [];

  if (mode === "reversal" && scannerResult.reversal) {
    reversalMonitor.stocks.clear();

    const params = {
      flatGapThreshold: config.flatGapThreshold ?? 0.003,
      entrySlPct: config.entrySlPct ?? 0.04,
      lowViolationPct: config.lowViolationPct ?? 0.01,
      trailingSlThreshold: config.trailingSlThreshold ?? 0.05,
      gapUpMaxPct: config.gapUpMaxPct ?? 0.05,
    };

    for (const stock of scannerResult.reversal.stocks) {
      const key = stock.instrumentKey || `NSE_EQ|${stock.symbol}`;
      reversalMonitor.addStock(stock.symbol, key, stock.previousClose, stock.situation as ReversalSituation, params, stock.declineDays || 0);
      instrumentKeys.push(key);
      log(`Loaded reversal stock: ${stock.symbol} (prev close: ${stock.previousClose}, decline: ${stock.declineDays || 0}d)`);
    }

    reversalIntegration = new ReversalIntegration(streamer, reversalMonitor, paperTrader, config.maxPositions);
  }

  if (mode === "continuation" && scannerResult.continuation) {
    continuationMonitor.stocks.clear();

    const params = {
      flatGapThreshold: config.flatGapThreshold ?? 0.003,
      entrySlPct: config.entrySlPct ?? 0.04,
      lowViolationPct: config.lowViolationPct ?? 0.01,
      trailingSlThreshold: config.trailingSlThreshold ?? 0.05,
      gapUpMaxPct: config.gapUpMaxPct ?? 0.05,
      entryTime: config.entryTime,
    };

    for (const stock of scannerResult.continuation.stocks) {
      const key = stock.instrumentKey || `NSE_EQ|${stock.symbol}`;
      continuationMonitor.addStock(stock.symbol, key, stock.previousClose, params);
      instrumentKeys.push(key);
      log(`Loaded continuation stock: ${stock.symbol} (prev close: ${stock.previousClose})`);
    }

    continuationIntegration = new ContinuationIntegration(streamer, continuationMonitor, paperTrader, config.maxPositions);
  }

  streamer.updateActiveInstruments(instrumentKeys);
  if (streamer.connected) streamer.subscribe();

  return { reversalIntegration, continuationIntegration };
}
