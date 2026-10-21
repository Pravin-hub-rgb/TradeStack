/**
 * ORB regression tests — Continuation mode.
 *
 * Locks in the live-trading behaviour introduced in commit 812cca7
 * ("5-min ORB breakout trading behaviour"):
 *   - ORB window tracking from I1 OHLC (max high / min low / earliest open)
 *   - Freeze at ENTRY_TIME (no ratcheting after orbFrozen)
 *   - Strict `>` breakout (touching entryHigh must NOT enter)
 *   - Feed-time timestamps on entry (payload ltt, not wall clock)
 *   - Gap + volume + low-violation gates
 *
 * Must stay green while Phase 2 promotes ORB fields into a shared typed base.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockStateEnum } from "../../src/lib/live-trader/types";
import {
  ContinuationStockState,
} from "../../src/lib/live-trader/continuation/stock-monitor";
import { ContinuationTickProcessor } from "../../src/lib/live-trader/continuation/tick-processor";
import { OHLCData } from "../../src/lib/live-trader/types";

const PARAMS = {
  flatGapThreshold: 0.003,
  entrySlPct: 0.04,
  lowViolationPct: 0.01,
  gapUpMaxPct: 0.05,
  entryTime: "09:20",
};

/** Local-time timestamp helper (IST market hours in fixtures). ms epoch. */
const tsOf = (h: number, m: number, s = 0): number =>
  new Date(2026, 9, 21, h, m, s, 0).getTime();

const feed = (h: number, m: number, s = 0): Date => new Date(2026, 9, 21, h, m, s, 0);

const candle = (
  ts: number,
  open: number,
  high: number,
  low: number,
  close: number,
): OHLCData => ({ interval: "I1", open, high, low, close, vol: 1000, ts });

const makeStock = (prevClose = 100): ContinuationStockState => {
  const stock = new ContinuationStockState("TEST", "NSE_EQ|TEST", prevClose, PARAMS);
  stock.setOrbStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));
  return stock;
};

/** Pass all gates up to WAITING_FOR_ENTRY with entry levels frozen to orbHigh. */
const qualifyToFrozen = (s: ContinuationStockState): void => {
  s.setOpenPrice(101);
  expect(s.validateGap()).toBe(true);
  expect(s.checkLowViolation()).toBe(true);
  s.volumeBaseline = 1_000_000;
  s.earlyVolume = 100_000;
  expect(s.validateVolume(0.075)).toBe(true);
  s.processOHLC([candle(tsOf(9, 15), 100, 102, 99, 101)]);
  s.freezeOrb();
  s.prepareEntry();
};

beforeEach(() => {
  // prepareEntry() compares wall clock to ENTRY_TIME — freeze it past 09:20
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("continuation gap gates", () => {
  it("rejects a flat gap", () => {
    const s = makeStock(100);
    s.setOpenPrice(100.2); // +0.2%
    expect(s.validateGap()).toBe(false);
    expect(s.state).toBe(StockStateEnum.REJECTED);
  });

  it("rejects a gap down (continuation needs gap up)", () => {
    const s = makeStock(100);
    s.setOpenPrice(97); // -3%
    expect(s.validateGap()).toBe(false);
    expect(s.state).toBe(StockStateEnum.REJECTED);
  });

  it("rejects a gap up beyond gapUpMaxPct", () => {
    const s = makeStock(100);
    s.setOpenPrice(106); // +6% > 5%
    expect(s.validateGap()).toBe(false);
    expect(s.state).toBe(StockStateEnum.REJECTED);
  });

  it("accepts a normal gap up", () => {
    const s = makeStock(100);
    s.setOpenPrice(103); // +3%
    expect(s.validateGap()).toBe(true);
    expect(s.gapValidated).toBe(true);
    expect(s.situation).toBe("continuation");
  });
});

describe("continuation ORB tracking from I1 OHLC", () => {
  it("tracks orbHigh/orbLow/firstCandleOpen from the 5-min window", () => {
    const s = makeStock();
    s.processOHLC([
      candle(tsOf(9, 15), 100, 102, 99, 101),
      candle(tsOf(9, 16), 101, 103, 100, 102),
      candle(tsOf(9, 17), 102, 101.5, 100.5, 101),
    ]);
    expect(s.orbHigh).toBe(103);
    expect(s.orbLow).toBe(99);
    expect(s.firstCandleOpen).toBe(100);
  });

  it("ignores candles before the ORB start minute", () => {
    const s = makeStock();
    s.processOHLC([candle(tsOf(9, 14, 30), 105, 108, 90, 101)]);
    expect(s.orbHigh).toBeNull();
    expect(s.orbLow).toBeNull();
    expect(s.firstCandleOpen).toBeNull();
  });

  it("updates firstCandleOpen when an earlier I1 packet arrives late", () => {
    // Regression: first packet only carries the later candle; when the 09:15
    // candle arrives in a later packet, firstCandleOpen must move to 100.
    const s = makeStock();
    s.processOHLC([candle(tsOf(9, 16), 101, 103, 100, 102)]);
    expect(s.firstCandleOpen).toBe(101);
    s.processOHLC([
      candle(tsOf(9, 15), 100, 102, 99, 101),
      candle(tsOf(9, 16), 101, 103, 100, 102),
    ]);
    expect(s.firstCandleOpen).toBe(100);
  });

  it("freezeOrb locks the 5-min range into daily high/low for display", () => {
    const s = makeStock();
    s.processOHLC([
      candle(tsOf(9, 15), 100, 102, 99, 101),
      candle(tsOf(9, 16), 101, 103, 100, 102),
    ]);
    s.freezeOrb();
    expect(s.orbFrozen).toBe(true);
    expect(s.dailyHigh).toBe(103);
    expect(s.dailyLow).toBe(99);
  });
});

describe("continuation entry preparation", () => {
  it("freezes entryHigh at orbHigh (not the ratcheting dailyHigh)", () => {
    const s = makeStock();
    qualifyToFrozen(s);
    expect(s.state).toBe(StockStateEnum.WAITING_FOR_ENTRY);
    expect(s.entryHigh).toBe(102); // orbHigh, not dailyHigh
    expect(s.entrySl).toBeCloseTo(102 * (1 - 0.04), 10);
  });

  it("does not enter when price touches entryHigh, only strictly above", () => {
    const s = makeStock();
    qualifyToFrozen(s);

    const proc = new ContinuationTickProcessor(s);
    proc.processTick(102, feed(9, 21)); // == entryHigh → HOLD
    expect(s.entered).toBe(false);

    proc.processTick(102.05, feed(9, 21, 30)); // > entryHigh → BREAKOUT
    expect(s.entered).toBe(true);
    expect(s.entryPrice).toBe(102.05);
    expect(s.entryTime).toEqual(feed(9, 21, 30)); // feed-time timestamp
  });

  it("exits on stop-loss hit with pnl% from the breakout price", () => {
    const s = makeStock();
    qualifyToFrozen(s);

    const proc = new ContinuationTickProcessor(s);
    proc.processTick(102.05, feed(9, 21));
    expect(s.entered).toBe(true);

    const sl = 102 * (1 - 0.04); // 97.92
    proc.processTick(sl - 0.01, feed(9, 25));
    expect(s.state).toBe(StockStateEnum.EXITED);
    expect(s.exitPrice).toBe(sl - 0.01);
    expect(s.pnl).not.toBeNull();
    expect(s.pnl!).toBeLessThan(0);
  });

  it("does not enter before ENTRY_TIME even when breakout level is hit", () => {
    const s = makeStock();
    qualifyToFrozen(s);

    const proc = new ContinuationTickProcessor(s);
    proc.processTick(103, feed(9, 19, 30)); // pre-entry-time breakout tick
    expect(s.entered).toBe(false);
    proc.processTick(103, feed(9, 20, 30)); // same price after ENTRY_TIME
    expect(s.entered).toBe(true);
  });
});
