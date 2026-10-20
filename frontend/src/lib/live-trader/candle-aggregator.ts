/**
 * CandleAggregator — port of option-trading-bot/backend/core/candle.py
 * Handles automatic I1 candle assembly from Upstox WebSocket ohlcList ticks.
 * Uses feed's ltt (feedTime) to decide completeness, not wall clock.
 */

export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  symbol: string;
}

export class CandleAggregator {
  public symbol: string;
  private candleHistory: Candle[] = [];
  private currentCandle: Candle | null = null;
  private currentMinute: Date | null = null;
  private processedMinutes: Set<string> = new Set();
  private listeners: Array<(event: string, candle: Candle) => void> = [];
  private startMinute: Date | null = null;

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  addListener(cb: (event: string, candle: Candle) => void): void {
    this.listeners.push(cb);
  }

  private notify(event: string, candle: Candle): void {
    for (const cb of this.listeners) cb(event, candle);
  }

  setStartMinute(minute: Date | null): void {
    this.startMinute = minute;
    if (minute !== null) {
      const startKey = this.formatMinute(minute);
      this.candleHistory = this.candleHistory.filter(
        (c) => this.formatMinute(c.timestamp) >= startKey
      );
      const nextSet = new Set<string>();
      for (const k of this.processedMinutes) if (k >= startKey) nextSet.add(k);
      this.processedMinutes = nextSet;
    }
  }

  private formatMinute(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  /**
   * Called per-tick with ohlc high/low for a given 1-min bar.
   * Returns true if a NEW candle was closed and added to history.
   * Mirrors option-trading-bot logic: use feedTime (ltt) to decide completeness.
   */
  updateFromOhlc(
    timestamp: Date,
    openPrice: number,
    highPrice: number,
    lowPrice: number,
    closePrice: number,
    feedTime?: Date
  ): boolean {
    const minute = new Date(timestamp);
    minute.setSeconds(0, 0);
    const minuteKey = this.formatMinute(minute);

    if (this.startMinute !== null && minute < this.startMinute) return false;
    if (this.processedMinutes.has(minuteKey)) return false;

    const candle: Candle = {
      timestamp: minute,
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: closePrice,
      symbol: this.symbol,
    };

    // Use feed's own ltt to decide completeness, not wall clock.
    // Bar is complete when its minute < current feed minute.
    const ref = feedTime ? new Date(feedTime) : new Date();
    ref.setSeconds(0, 0);
    if (minute < ref) {
      if (this.processedMinutes.has(minuteKey)) return false;
      this.candleHistory.push(candle);
      this.processedMinutes.add(minuteKey);
      this.notify("candle_closed", candle);
      return true;
    } else if (minute.getTime() === ref.getTime()) {
      if (
        this.currentMinute === null ||
        this.currentMinute.getTime() !== minute.getTime()
      ) {
        this.currentCandle = candle;
        this.currentMinute = minute;
      } else if (this.currentCandle) {
        this.currentCandle.high = Math.max(this.currentCandle.high, highPrice);
        this.currentCandle.low = Math.min(this.currentCandle.low, lowPrice);
        this.currentCandle.close = closePrice;
      }
      if (this.currentCandle) this.notify("candle_updated", this.currentCandle);
    }
    return false;
  }

  getCandleHistory(): Candle[] {
    return this.candleHistory;
  }

  getCurrentCandle(): Candle | null {
    return this.currentCandle;
  }
}
