import { LiveTraderConfig, ScannerStock } from "./types";
import { ReversalStockMonitor } from "./reversal/stock-monitor";
import { StockMonitor as ContinuationStockMonitor } from "./continuation/stock-monitor";
import { fetchFromPython, sleepUntilIST } from "./task-utils";

export interface PreMarketParams {
  mode: "reversal" | "continuation";
  config: LiveTraderConfig;
  continuationMonitor: ContinuationStockMonitor | null;
  reversalMonitor: ReversalStockMonitor | null;
}

export async function runPreMarketFlow(
  params: PreMarketParams,
  stocks: ScannerStock[],
  log: (msg: string) => void,
): Promise<{ validatedKeys: string[] }> {
  if (!params.config) throw new Error("Not initialized");

  const isContinuation = params.mode === "continuation";
  const symbols = stocks.map((s) => s.symbol);
  log(`Starting pre-market flow for ${stocks.length} stocks (mode: ${params.mode})`);

  let vahPrices: Record<string, number> = {};
  let volumeBaselines: Record<string, number> = {};
  let iepPrices: Record<string, number> = {};

  if (isContinuation) {
    try {
      log("Fetching volume baselines from cache...");
      const vbResult = await fetchFromPython<{ baselines: Record<string, number> }>(
        "/api/prep/volume-baselines", { symbols },
      );
      volumeBaselines = vbResult.baselines;
      log(`Volume baselines loaded for ${Object.keys(volumeBaselines).length} symbols`);
    } catch (e: any) {
      log(`Volume baseline fetch failed: ${e.message}`);
    }

    try {
      log(`Fetching VAH for ${symbols.length} continuation stocks...`);
      const vahResult = await fetchFromPython<{ vah: Record<string, number> }>(
        "/api/prep/volume-profile", { symbols },
      );
      vahPrices = vahResult.vah;
      log(`VAH calculated for ${Object.keys(vahPrices).length} stocks`);
    } catch (e: any) {
      log(`VAH fetch failed: ${e.message}`);
    }

    for (const stock of stocks) {
      const key = stock.instrumentKey || stock.symbol;
      const stockState = params.continuationMonitor?.stocks.get(key);
      if (stockState) {
        if (vahPrices[stock.symbol] !== undefined) stockState.vahPrice = vahPrices[stock.symbol];
        if (volumeBaselines[stock.symbol] !== undefined) stockState.volumeBaseline = volumeBaselines[stock.symbol];
      }
    }
  }

  log(`Waiting for PREP_START (${params.config.prepStart})...`);
  await sleepUntilIST(params.config.prepStart);

  try {
    log(`Fetching IEP for ${symbols.length} symbols...`);
    const iepResult = await fetchFromPython<{ prices: Record<string, number> }>(
      "/api/prep/iep", { symbols },
    );
    iepPrices = iepResult.prices;
    log(`IEP fetched for ${Object.keys(iepPrices).length} symbols`);
  } catch (e: any) {
    log(`IEP fetch failed: ${e.message}`);
  }

  const validatedKeys: string[] = [];

  for (const stock of stocks) {
    const key = stock.instrumentKey || stock.symbol;
    const iep = iepPrices[stock.symbol];

    const stockState: any = isContinuation
      ? params.continuationMonitor?.stocks.get(key)
      : params.reversalMonitor?.stocks.get(key);

    if (!stockState) { log(`${stock.symbol}: Not found in any monitor, skipping`); continue; }

    if (!iep) {
      if (isContinuation) {
        stockState.reject("No IEP data available");
        stockState.volumeBaseline = volumeBaselines[stock.symbol] ?? 1000000;
        log(`${stock.symbol}: No IEP, rejecting`);
      } else { stockState.reject("No IEP data available"); log(`${stock.symbol}: No IEP, rejecting`); }
      continue;
    }

    stockState.setOpenPrice(iep);
    if (isContinuation) stockState.volumeBaseline = volumeBaselines[stock.symbol] ?? 1000000;

    const gapOk = stockState.validateGap();
    if (!gapOk) { log(`${stock.symbol}: Gap validation FAILED - ${stockState.rejectionReason}`); continue; }

    if (isContinuation) {
      const vah = vahPrices[stock.symbol];
      if (vah === undefined) {
        stockState.reject("VAH data missing (mandatory V gate)");
        log(`${stock.symbol}: VAH data missing, rejecting (mandatory V gate)`);
        continue;
      }
      const vahOk = stockState.validateVahRejection(vah);
      if (!vahOk) { log(`${stock.symbol}: VAH validation FAILED - ${stockState.rejectionReason}`); continue; }
    }

    validatedKeys.push(key);
    const gapPct = ((iep - stock.previousClose) / stock.previousClose * 100).toFixed(2);
    const vahStr = isContinuation && vahPrices[stock.symbol] !== undefined ? `vah=${vahPrices[stock.symbol]}` : "vah=N/A (reversal)";
    log(`${stock.symbol}: VALIDATED (gap=${gapPct}%, ${vahStr})`);
  }

  log(`Pre-market complete: ${validatedKeys.length}/${stocks.length} validated`);
  return { validatedKeys };
}
