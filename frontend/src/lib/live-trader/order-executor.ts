/**
 * TradeExecutor — the single seam between "the bot decided to enter" and
 * "a trade record exists".
 *
 *   paper mode  → PaperExecutor    (SQLite trade log only, zero orders)
 *   real mode    → UpstoxExecutor   (MARKET entry → poll fill → SL-M stop)
 *
 * Both implement the same call the integrations already make:
 *   logEntry(stock, price, time, tradeType)
 *
 * Philosophy (per design): fire-and-track. The bot places the entry order and
 * the stop-loss, verifies both, writes the trade log — and does NOT manage
 * the position afterwards. Exits are manual; the exchange-side SL-M fills on
 * its own if the stop trades. The bot never places exit orders.
 */

import { TradableStock } from "./paper-trader";
import { OrderProduct } from "./types";
import { PY_API } from "@/lib/api";

export type { OrderProduct } from "./types";

export interface TradeExecutor {
  /** Called exactly once per stock entry (guard inside each implementation). */
  logEntry(stock: TradableStock, price: number, time: Date, tradeType: string): void;
  /** Called when the state machine marks the position exited (stop hit). */
  logExit(stock: TradableStock, price: number, time: Date, reason: string): void;
}

/** Type of a live status/log sink so the executor can narrate on the terminal. */
export type OrderLogFn = (msg: string, level?: "DEBUG" | "INFO" | "WARN" | "ERROR") => void;

/** Builds the executor chosen by the paper_trading setting. */
export function createTradeExecutor(
  paperTrading: boolean,
  paper: {
    logEntry: (stock: TradableStock, price: number, time: Date, tradeType: string) => void;
    logExit: (stock: TradableStock, price: number, time: Date, reason: string) => void;
  },
  accessToken: string,
  options: { product: OrderProduct; quantity: number },
): TradeExecutor {
  if (paperTrading) return new PaperExecutor(paper.logEntry, paper.logExit);
  return new UpstoxExecutor(accessToken, options);
}

/* ------------------------------------------------------------------ *
 * Paper executor — pure SQLite trade log (what ran until now).
 * ------------------------------------------------------------------ */
export class PaperExecutor implements TradeExecutor {
  constructor(
    private paperLogEntry: (stock: TradableStock, price: number, time: Date, tradeType: string) => void,
    private paperLogExit: (stock: TradableStock, price: number, time: Date, reason: string) => void,
  ) {}

  logEntry(stock: TradableStock, price: number, time: Date, tradeType: string): void {
    this.paperLogEntry(stock, price, time, tradeType);
  }

  logExit(stock: TradableStock, price: number, time: Date, reason: string): void {
    this.paperLogExit(stock, price, time, reason);
  }
}

/* ------------------------------------------------------------------ *
 * Upstox executor — real order flow.
 * ------------------------------------------------------------------ */
interface PlaceBody {
  quantity: number;
  product: OrderProduct;
  validity: "DAY";
  price: number;
  tag: string;
  instrument_token: string;
  order_type: "MARKET" | "SL-M";
  transaction_type: "BUY" | "SELL";
  trigger_price: number;
}

interface OrderDetails {
  status: string; // complete | rejected | open | trigger pending | ...
  average_price?: number;
  filled_quantity?: number;
  status_message?: string | null;
}

const UPSTOX_BASE = "https://api.upstox.com/v2";
const POLL_ATTEMPTS = 8;
const POLL_DELAY_MS = 500;

export class UpstoxExecutor implements TradeExecutor {
  private entered = new Set<string>();
  private openTrades = new Map<string, { avgPrice: number; qty: number }>();

  constructor(
    private accessToken: string,
    private options: { product: OrderProduct; quantity: number; log?: OrderLogFn },
  ) {}

  private log(msg: string, level: "DEBUG" | "INFO" | "WARN" | "ERROR" = "INFO"): void {
    console.log(`[ORDERS] ${msg}`);
    this.options.log?.(`[Orders] ${msg}`, level);
  }

  logEntry(stock: TradableStock, price: number, time: Date, tradeType: string): void {
    if (this.entered.has(stock.symbol)) return;
    this.entered.add(stock.symbol);
    void this.executeEntry(stock, price, tradeType, time);
  }

  /** MARKET buy → poll fill → SL-M sell at the entry stop. Never blocks the tick loop. */
  private async executeEntry(stock: TradableStock, price: number, tradeType: string, time: Date): Promise<void> {
    const symbol = stock.symbol;
    const instrument = stock.instrumentKey ?? "";
    if (!this.accessToken || !instrument) {
      this.log(`${symbol}: entry aborted — token/instrument missing`, "ERROR");
      return;
    }

    this.log(`${symbol}: placing ENTRY (MARKET ${this.options.product} x${this.options.quantity}) @~${price.toFixed(2)} (${tradeType})`);
    let entryId: string | null;
    try {
      entryId = await this.placeOrder({
        quantity: this.options.quantity,
        product: this.options.product,
        validity: "DAY",
        price: 0,
        tag: "TS-ENTRY",
        instrument_token: instrument,
        order_type: "MARKET",
        transaction_type: "BUY",
        trigger_price: 0,
      });
    } catch (e) {
      const err = e as Error;
      this.log(`ENTRY FAILED for ${symbol}: ${err.message}`, "ERROR");
      return;
    }
    if (!entryId) { this.log(`ENTRY rejected for ${symbol}`, "ERROR"); return; }
    this.log(`${symbol}: entry order ${entryId} placed, waiting for fill...`);

    const filled = await this.waitForTerminal(entryId, `${symbol} entry`);
    if (!filled || !filled.complete) {
      this.log(`ENTRY ${symbol} not filled (${filled?.status ?? "unknown"}) — SL not placed, manage manually`, "ERROR");
      return;
    }
    const avgPrice = filled.averagePrice ?? price;
    this.openTrades.set(stock.symbol, { avgPrice, qty: filled.quantityFills ?? this.options.quantity });
    this.log(`${symbol}: ENTRY FILLED avg=${avgPrice.toFixed(2)} qty=${filled.quantityFills}`);

    if (stock.entrySl === undefined || stock.entrySl === null) {
      this.log(`${symbol}: entrySl missing on stock state — SL NOT placed, manage manually`, "ERROR");
    } else {
      this.log(`${symbol}: placing SL-M SELL trigger=${stock.entrySl.toFixed(2)}`);
      let slId: string | null = null;
      try {
        slId = await this.placeOrder({
          quantity: filled.quantityFills ?? this.options.quantity,
          product: this.options.product,
          validity: "DAY",
          price: 0,
          tag: "TS-SL",
          instrument_token: instrument,
          order_type: "SL-M",
          transaction_type: "SELL",
          trigger_price: stock.entrySl,
        });
      } catch (e) {
        const err = e as Error;
        this.log(`SL PLACEMENT FAILED for ${symbol}: ${err.message} — manage manually`, "ERROR");
      }
      if (!slId) {
        this.log(`SL rejected for ${symbol} — MANAGE POSITION MANUALLY`, "ERROR");
      } else {
        // A stop sits "open"/"trigger pending" for hours — one acceptance check
        // is enough. Polling would just spin on a healthy pending order.
        const d = await this.details(slId);
        if (!d) {
          this.log(`${symbol}: SL order accepted (${slId}) — status check failed, verify manually`, "WARN");
        } else if (d.status === "rejected") {
          this.log(`${symbol}: SL REJECTED — MANAGE POSITION MANUALLY`, "ERROR");
        } else if (d.status === "complete") {
          this.log(`${symbol}: SL triggered & filled immediately (gap through trigger?)`);
        } else {
          this.log(`${symbol}: SL stop order ${slId} (${d.status ?? "accepted"}) — will trigger on exchange`);
        }
      }
    }

    await this.recordTrade(stock, avgPrice, filled.quantityFills ?? this.options.quantity, tradeType, time);
  }

  /** Stop traded on the exchange (state machine detected the breach) — update the trade log. */
  logExit(stock: TradableStock, price: number, time: Date, reason: string): void {
    const open = this.openTrades.get(stock.symbol);
    const pnl = open ? (price - open.avgPrice) * open.qty : null;
    this.log(`${stock.symbol}: EXIT (${reason}) @ ${price.toFixed(2)}${pnl !== null ? ` PnL ≈ ₹${pnl.toFixed(2)}` : ""}`);
    this.openTrades.delete(stock.symbol);
    void this.recordTradeExit(stock, price, time);
  }

  private async recordTradeExit(stock: TradableStock, price: number, time: Date): Promise<void> {
    try {
      const listRes = await fetch(`${PY_API}/api/trades/list`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!listRes.ok) return;
      const data = (await listRes.json()) as { trades: { id: string | number; symbol: string; exit_price: number | string | null }[] };
      const existing = (data.trades || []).find((t) => t.symbol === stock.symbol && !t.exit_price);
      if (existing) {
        await fetch(`${PY_API}/api/trades/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exit_date: time.toISOString().slice(0, 10),
            exit_price: price,
          }),
        });
      }
    } catch {
      /* trade-log bookkeeping is best-effort; the position itself lives on Upstox */
    }
  }

  private async placeOrder(body: PlaceBody): Promise<string | null> {
    const res = await fetch(`${UPSTOX_BASE}/order/place`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { status?: string; data?: { order_id?: string }; errors?: unknown };
    if (!res.ok || data.status !== "success" || !data.data?.order_id) {
      this.log(`order/place HTTP ${res.status}: ${JSON.stringify(data.errors ?? data).slice(0, 300)}`, "ERROR");
      return null;
    }
    return data.data.order_id;
  }

  private async details(orderId: string): Promise<OrderDetails | null> {
    const res = await fetch(`${UPSTOX_BASE}/order/details?order_id=${encodeURIComponent(orderId)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: string; data?: OrderDetails };
    return json.data ?? null;
  }

  private async waitForTerminal(orderId: string, label: string): Promise<{
    complete: boolean; status: string; averagePrice?: number; quantityFills?: number;
  } | null> {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const d = await this.details(orderId);
      if (!d) { this.log(`${label}: order details fetch failed (attempt ${i + 1})`, "WARN"); }
      else if (d.status === "complete") return { complete: true, status: d.status, averagePrice: d.average_price, quantityFills: d.filled_quantity };
      else if (d.status === "rejected") {
        this.log(`${label}: REJECTED — ${d.status_message ?? "no reason given"}`, "ERROR");
        return { complete: false, status: d.status };
      }
      await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
    }
    this.log(`${label}: still '${await this.lastStatus(orderId)}' after ${(POLL_ATTEMPTS * POLL_DELAY_MS / 1000).toFixed(1)}s`, "WARN");
    return null;
  }

  private async lastStatus(orderId: string): Promise<string> {
    const d = await this.details(orderId);
    return d?.status ?? "unknown";
  }

  private async recordTrade(
    stock: TradableStock, avgPrice: number, qty: number, tradeType: string, time: Date,
  ): Promise<void> {
    try {
      const res = await fetch(`${PY_API}/api/trades/log-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: stock.symbol,
          instrument_key: stock.instrumentKey ?? "",
          entry_price: avgPrice,
          entry_sl: stock.entrySl ?? null,
          quantity: qty,
          trade_type: tradeType,
          entry_time: time.toISOString(),
          entry_date: time.toISOString().slice(0, 10),
          session_id: `real_${time.toISOString().slice(0, 19)}`,
        }),
      });
      if (!res.ok) this.log(`trade log HTTP ${res.status} for ${stock.symbol}`, "WARN");
    } catch (e) {
      const err = e as Error;
      this.log(`trade log failed for ${stock.symbol}: ${err.message}`, "WARN");
    }
  }
}
