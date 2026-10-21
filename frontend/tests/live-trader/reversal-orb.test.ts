/**
 * ORB regression tests — Reversal mode.
 *
 * Locks in the live-trading behaviour from commits 812cca7 + bbb285b:
 *   - ORB tracking from I1 OHLC via CandleAggregator (out-of-order packets OK)
 *   - Gap direction overrides pre-classification (OOPS gaps up → SS, SS gaps down → OOPS)
 *   - Low violation check prefers orbLow/firstCandleOpen (OHLC truth)
 *   - Freeze at ENTRY_TIME; strict `>` strong-start breakout (HAPPSTMNDS case)
 *   - OOPS enters when price >= previousClose, entryPrice stays previousClose
 *   - firstCandleOpen advisory must survive late-rearriving earlier candles
 */
import { describe, expect, it } from "vitest";
import { StockStateEnum } from "../../src/lib/live-trader/types";
import { OHLCData } from "../../src/lib/live-trader/types";
import type { ReversalSituation } from "../../src/lib/live-trader/types";
import {
  ReversalStockState,
  ReversalStockMonitor,
} from "../../src/lib/live-trader/reversal/stock-monitor";
import { ReversalTickProcessor } from "../../src/lib/live-trader/reversal/tick-processor";

const PARAMS = {
  flatGapThreshold: 0.003,
  entrySlPct: 0.04,
  lowViolationPct: 0.01,
  trailingSlThreshold: 0.05,
  gapUpMaxPct: 0.05,
  entryTime: "09:20",
};

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

const makeStock = (situation: ReversalSituation = "reversal_s1", prevClose = 100, declineDays = 0): ReversalStockState =>
  new ReversalStockState("TEST", "NSE_EQ|TEST", prevClose, situation, PARAMS, declineDays);

describe("reversal gap gates (direction override)", () => {
  it("OOPS (s2) that gaps up is re-classified as Strong Start (s1)", () => {
    const s = makeStock("reversal_s2", 100);
    s.setOpenPrice(103);
    expect(s.validateGap()).toBe(true);
    expect(s.situation).toBe("reversal_s1");
  });

  it("SS (s1) that gaps down is re-classified as OOPS (s2)", () => {
    const s = makeStock("reversal_s1", 100);
    s.setOpenPrice(97);
    expect(s.validateGap()).toBe(true);
    expect(s.situation).toBe("reversal_s2");
  });

  it("rejects a gap up beyond gapUpMaxPct", () => {
    const s = makeStock("reversal_s1", 100);
    s.setOpenPrice(106);
    expect(s.validateGap()).toBe(false);
    expect(s.state).toBe(StockStateEnum.REJECTED);
  });

  it("rejects a flat gap", () => {
    const s = makeStock("reversal_s1", 100);
    s.setOpenPrice(100.2);
    expect(s.validateGap()).toBe(false);
  });
});

describe("reversal ORB tracking from I1 via aggregator", () => {
  it("tracks orb extremes; late 09:15 packet still wins firstCandleOpen", () => {
    const s = makeStock();
    s.candleAggregator.setStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));

    // Packet 1: only the 09:16 candle seen
    s.processOHLC([candle(tsOf(9, 16), 101, 103, 100, 102)], feed(9, 17));
    expect(s.firstCandleOpen).toBe(101);
    expect(s.orbHigh).toBe(103);
    expect(s.orbLow).toBe(100);

    // Packet 2: earlier 09:15 candle arrives — firstCandleOpen must update
    s.processOHLC(
      [candle(tsOf(9, 15), 100, 102.5, 99, 101), candle(tsOf(9, 16), 101, 103, 100, 102)],
      feed(9, 17),
    );
    expect(s.firstCandleOpen).toBe(100);
    expect(s.orbHigh).toBe(103);
    expect(s.orbLow).toBe(99);
  });

  it("uses orbLow/firstCandleOpen for the low violation gate", () => {
    const s = makeStock();
    s.candleAggregator.setStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));
    s.setOpenPrice(103);
    s.validateGap();
    // IEP open 103; window lows stay above 103*0.99 → both primary (orbLow /
    // firstCandleOpen) and secondary (dailyLow vs openPrice) checks pass.
    s.processOHLC(
      [
        candle(tsOf(9, 15), 103, 104, 102.8, 103.5),
        candle(tsOf(9, 16), 103.5, 104.2, 102.5, 104),
      ],
      feed(9, 16),
    );
    expect(s.checkLowViolation()).toBe(true);
    expect(s.state).toBe(StockStateEnum.QUALIFIED);
  });

  it("rejects when orbLow breaches firstCandleOpen by lowViolationPct", () => {
    const s = makeStock();
    s.candleAggregator.setStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));
    s.setOpenPrice(103);
    s.validateGap();
    s.processOHLC([candle(tsOf(9, 15), 100, 102, 98.5, 101)], feed(9, 16));
    expect(s.checkLowViolation()).toBe(false);
    expect(s.rejectionReason).toContain("Low violation");
  });
});

describe("reversal ORB freeze + strong start entry", () => {
  it("freezeOrb() freezes entryHigh at orbHigh — strict > required (HAPPSTMNDS)", () => {
    const s = makeStock();
    s.candleAggregator.setStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));
    s.setOpenPrice(101);
    s.validateGap();
    expect(s.checkLowViolation()).toBe(true);
    s.processOHLC([candle(tsOf(9, 15), 100.5, 101.2, 100.3, 101)], feed(9, 19));
    s.freezeOrb();
    s.prepareEntry();

    expect(s.entryHigh).toBe(101.2);
    expect(s.orbFrozen).toBe(true);

    const proc = new ReversalTickProcessor(s);
    proc.processTick(101.2, feed(9, 21)); // touch == entryHigh → must NOT enter
    expect(s.entered).toBe(false);
    proc.processTick(101.4, feed(9, 21, 30)); // strictly above → enter
    expect(s.entered).toBe(true);
    expect(s.entryPrice).toBe(101.4);
    expect(s.entryTime).toEqual(feed(9, 21, 30));
  });

  it("entry levels do not ratchet above the frozen orbHigh after freeze", () => {
    const s = makeStock();
    s.candleAggregator.setStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));
    s.setOpenPrice(101);
    s.validateGap();
    expect(s.checkLowViolation()).toBe(true);
    s.processOHLC([candle(tsOf(9, 15), 100.5, 101.2, 100.3, 101)], feed(9, 19));
    s.freezeOrb();
    s.prepareEntry();
    // later tick lifts dailyHigh, but entryHigh must stay frozen
    s.updatePrice(105, feed(9, 23));
    s.updateEntryLevels();
    expect(s.entryHigh).toBe(101.2);
    expect(s.entrySl).toBeCloseTo(101.2 * (1 - 0.04), 10);
  });

  it("stop loss exits an entered SS position relative to the ORB high", () => {
    const s = makeStock();
    s.candleAggregator.setStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));
    s.setOpenPrice(101);
    s.validateGap();
    expect(s.checkLowViolation()).toBe(true);
    s.processOHLC([candle(tsOf(9, 15), 100.5, 101.2, 100.3, 101)], feed(9, 19));
    s.freezeOrb();
    s.prepareEntry();

    const proc = new ReversalTickProcessor(s);
    proc.processTick(101.4, feed(9, 21, 30));
    expect(s.entered).toBe(true);
    const sl = 101.2 * (1 - 0.04);
    proc.processTick(sl - 0.01, feed(9, 25));
    expect(s.state).toBe(StockStateEnum.EXITED);
    expect(s.exitPrice).toBe(sl - 0.01);
    expect(s.pnl!).toBeLessThan(0);
  });
});

describe("reversal OOPS entry", () => {
  it("enters when price >= previousClose, entryPrice stays previousClose", () => {
    const s = makeStock("reversal_s2", 100);
    s.setOpenPrice(97);
    s.validateGap();
    s.prepareEntry(); // prepareOops: entryPrice = prevClose

    expect(s.entryPrice).toBe(100);
    expect(s.entrySl).toBeCloseTo(100 * (1 - 0.04), 10);

    const proc = new ReversalTickProcessor(s);
    proc.processTick(99.5, feed(9, 20, 30)); // < prevClose → wait
    expect(s.entered).toBe(false);
    proc.processTick(100.5, feed(9, 21)); // >= prevClose → OOPS entry
    expect(s.entered).toBe(true);
    expect(s.entryPrice).toBe(100); // NOT the tick price
    expect(s.entryTime).toEqual(feed(9, 21));
  });
});

describe("reversal tick-time low violation rejection", () => {
  it("rejects an s1 stock when intraday OHLC low breaches the threshold", () => {
    const s = makeStock();
    s.candleAggregator.setStartMinute(new Date(2026, 9, 21, 9, 15, 0, 0));
    s.setOpenPrice(101);
    s.validateGap();
    // OHLC packet with a violation low arrives while the stock is active
    const proc = new ReversalTickProcessor(s);
    proc.processTick(101, feed(9, 18, 30), [
      candle(tsOf(9, 15), 100, 102, 98.5, 101), // orbLow 98.5 < 100*0.99
    ]);
    expect(s.state).toBe(StockStateEnum.REJECTED);
    expect(s.rejectionReason).toContain("Low violation");
  });
});

describe("reversal selection (priorities, already-entered stay)", () => {
  it("keeps entered stocks, picks by priority, rejects s1 tails", () => {
    const monitor = new ReversalStockMonitor();
    monitor.marketOpenTime = new Date(2026, 9, 21, 9, 15, 0, 0);

    // VIP loser (s2, 10 red days) gapping down
    monitor.addStock("VIP", "NSE_EQ|VIP", 100, "reversal_s2", PARAMS, 10);
    // Another OOPS gapping down (normal)
    monitor.addStock("BBB", "NSE_EQ|BBB", 100, "reversal_s2", PARAMS, 0);
    // Strong start gapping up (normal)
    monitor.addStock("AAA", "NSE_EQ|AAA", 100, "reversal_s1", PARAMS, 0);

    const vip = monitor.stocks.get("NSE_EQ|VIP")!;
    vip.setOpenPrice(97);
    vip.validateGap();

    const bbb = monitor.stocks.get("NSE_EQ|BBB")!;
    bbb.setOpenPrice(97);
    bbb.validateGap();

    const aaa = monitor.stocks.get("NSE_EQ|AAA")!;
    aaa.setOpenPrice(103);
    aaa.validateGap();
    aaa.checkLowViolation();

    // VIP already entered before ENTRY_TIME — keeps its slot
    vip.enterPosition(97.2, feed(9, 16));

    const result = monitor.selectStocks(2);
    const selectedSyms = result.selected.map((s) => s.symbol).sort();
    expect(selectedSyms).toEqual(["BBB", "VIP"]);
    expect(result.rejectedSS.map((k) => monitor.stocks.get(k)!.symbol)).toContain("AAA");
  });
});
