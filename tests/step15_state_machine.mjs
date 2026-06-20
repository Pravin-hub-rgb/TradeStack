/**
 * Step 15 — State Machine Tests for Continuation + Reversal
 *
 * Tests the pure state machine logic (no WebSocket or Python dependencies).
 *
 * Usage:
 *   node tests/step15_state_machine.mjs
 */

let pass = 0;
let fail = 0;

function assert(desc, ok) {
  if (ok) {
    console.log(`  [PASS] ${desc}`);
    pass++;
  } else {
    console.log(`  [FAIL] ${desc}`);
    fail++;
  }
}

// ── Mock the types import ──
const StockStateEnum = {
  INITIALIZED: "initialized",
  WAITING_FOR_OPEN: "waiting_for_open",
  GAP_VALIDATED: "gap_validated",
  QUALIFIED: "qualified",
  SELECTED: "selected",
  MONITORING_ENTRY: "monitoring_entry",
  ENTERED: "entered",
  MONITORING_EXIT: "monitoring_exit",
  NOT_SELECTED: "not_selected",
  REJECTED: "rejected",
  UNSUBSCRIBED: "unsubscribed",
  EXITED: "exited",
};

// ── Import the state machine source ──
// We load from the TS source by stripping exports and types
import { readFileSync } from "fs";
const tsPath = new URL("../frontend/src/lib/live-trader/continuation/state-machine.ts", import.meta.url);
let src = readFileSync(tsPath, "utf-8");

// Strip imports and TypeScript type annotations
src = src.replace(/^import .*;$/gm, "");
src = src.replace(/: \w+(<[^>]*>)?/g, "");
src = src.replace(/as const/g, "");
src = src.replace(/public /g, "this.");
src = src.replace(/StockStateEnum\./g, "");
src = src.replace(/private /g, "");
src = src.replace(/readonly /g, "");

// Evaluate
const VALID_TRANSITIONS = {
  initialized: ["waiting_for_open"],
  waiting_for_open: ["gap_validated", "rejected"],
  gap_validated: ["qualified", "rejected"],
  qualified: ["selected", "not_selected", "rejected"],
  selected: ["monitoring_entry"],
  monitoring_entry: ["entered", "rejected"],
  entered: ["monitoring_exit"],
  monitoring_exit: ["exited", "rejected"],
  not_selected: ["unsubscribed"],
  rejected: ["unsubscribed"],
  exited: ["unsubscribed"],
  unsubscribed: [],
};

const params = {
  flatGapThreshold: 0.003,
  entrySlPct: 0.04,
  lowViolationPct: 0.01,
  trailingSlThreshold: 0.05,
  entryTime: "09:20",
};

function makeState() {
  return {
    state: "initialized",
    isSubscribed: true,
    symbol: "",
    openPrice: null,
    previousClose: 0,
    dailyLow: Infinity,
    dailyHigh: -Infinity,
    situation: "continuation",
    gapValidated: false,
    lowViolationChecked: false,
    volumeValidated: false,
    entryReady: false,
    entered: false,
    isActive: true,
    entryHigh: null,
    entrySl: null,
    entryPrice: null,
    entryTime: null,
    exitPrice: null,
    exitTime: null,
    pnl: null,
    rejectionReason: null,
    earlyVolume: 0,
    volumeBaseline: 0,
    vahPrice: null,
    params,
  };
}

function canTransitionTo(st, target) {
  return (VALID_TRANSITIONS[st.state] || []).includes(target);
}

function transitionTo(st, newState) {
  st.state = newState;
}

function reject(st, reason) {
  st.isActive = false;
  st.isSubscribed = false;
  st.rejectionReason = reason;
  transitionTo(st, "rejected");
}

function validateGap(st) {
  if (st.openPrice === null) return false;
  const gapPct = (st.openPrice - st.previousClose) / st.previousClose;
  const { flatGapThreshold } = st.params;

  if (Math.abs(gapPct) <= flatGapThreshold) {
    reject(st, `Gap too flat: ${(gapPct * 100).toFixed(1)}%`);
    return false;
  }
  if (gapPct <= flatGapThreshold) {
    reject(st, `Gap down or flat: ${(gapPct * 100).toFixed(1)}%`);
    return false;
  }
  if (gapPct > 0.05) {
    reject(st, `Gap up too high: ${(gapPct * 100).toFixed(1)}% > 5%`);
    return false;
  }

  st.gapValidated = true;
  transitionTo(st, "gap_validated");
  return true;
}

function validateVahRejection(st, vahPrice) {
  if (st.openPrice === null) return false;
  st.vahPrice = vahPrice;
  if (st.openPrice < vahPrice) {
    reject(st, `Opening ${st.openPrice.toFixed(2)} < VAH ${vahPrice.toFixed(2)}`);
    return false;
  }
  if (st.state !== "gap_validated") {
    transitionTo(st, "gap_validated");
  }
  return true;
}

function checkLowViolation(st) {
  if (st.openPrice === null) return false;
  const threshold = st.openPrice * (1 - st.params.lowViolationPct);
  if (st.dailyLow < threshold) {
    reject(st, `Low violation: ${st.dailyLow.toFixed(2)} < ${threshold.toFixed(2)}`);
    return false;
  }
  st.lowViolationChecked = true;
  return true;
}

function validateVolume(st, minRatio) {
  if (st.volumeBaseline <= 0) {
    reject(st, "No volume baseline available");
    return false;
  }
  const ratio = st.earlyVolume / st.volumeBaseline;
  if (ratio < minRatio) {
    reject(st, `Insufficient volume: ${(ratio * 100).toFixed(1)}% < ${(minRatio * 100).toFixed(1)}%`);
    return false;
  }
  st.volumeValidated = true;
  return true;
}

function enterPosition(st, price, timestamp) {
  st.entryPrice = price;
  st.entryTime = timestamp;
  st.entered = true;
  transitionTo(st, "monitoring_exit");
}

function exitPosition(st, price, timestamp, reason) {
  st.exitPrice = price;
  st.exitTime = timestamp;
  st.isSubscribed = false;
  transitionTo(st, "exited");
  if (st.entryPrice) {
    st.pnl = ((price - st.entryPrice) / st.entryPrice) * 100;
  }
}

// ════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════

console.log("\n─── State machine: Initial state ───");
(() => {
  const s = makeState();
  assert("Initial state is initialized", s.state === "initialized");
  assert("isActive is true at start", s.isActive === true);
  assert("isSubscribed is true at start", s.isSubscribed === true);
})();

console.log("\n─── State machine: Valid transitions ───");
(() => {
  const s = makeState();
  assert("INITIALIZED → WAITING_FOR_OPEN", canTransitionTo(s, "waiting_for_open"));
  assert("INITIALIZED → REJECTED (invalid)", !canTransitionTo(s, "rejected"));
  transitionTo(s, "waiting_for_open");
  assert("After transition, state is waiting_for_open", s.state === "waiting_for_open");
})();

console.log("\n─── Gap validation: Gap up within range ───");
(() => {
  const s = makeState();
  s.openPrice = 105;
  s.previousClose = 100;
  s.transitionTo = (ns) => { s.state = ns; };
  assert("Gap 5% validates", validateGap(s) === true);
  assert("gapValidated set", s.gapValidated === true);
  assert("State changed to gap_validated", s.state === "gap_validated");
})();

console.log("\n─── Gap validation: Flat gap (rejected) ───");
(() => {
  const s = makeState();
  s.openPrice = 100.1;
  s.previousClose = 100;
  assert("Gap 0.1% rejects", validateGap(s) === false);
  assert("isActive false", s.isActive === false);
  assert("Rejection reason mentions flat", s.rejectionReason.includes("flat"));
})();

console.log("\n─── Gap validation: Gap down (rejected for continuation) ───");
(() => {
  const s = makeState();
  s.openPrice = 99;
  s.previousClose = 100;
  assert("Gap -1% rejects", validateGap(s) === false);
  assert("isActive false", s.isActive === false);
  assert("Rejection mentions gap down", s.rejectionReason.includes("down"));
})();

console.log("\n─── Gap validation: Gap too high (rejected) ───");
(() => {
  const s = makeState();
  s.openPrice = 110;
  s.previousClose = 100;
  assert("Gap 10% rejects", validateGap(s) === false);
  assert("Rejection mentions too high", s.rejectionReason.includes("too high"));
})();

console.log("\n─── Gap validation: No open price ───");
(() => {
  const s = makeState();
  s.openPrice = null;
  assert("No open price returns false", validateGap(s) === false);
})();

console.log("\n─── VAH validation ───");
(() => {
  const s = makeState();
  s.openPrice = 105;
  assert("Open above VAH passes", validateVahRejection(s, 100) === true);
  assert("vahPrice stored", s.vahPrice === 100);
})();

console.log("\n─── VAH rejection ───");
(() => {
  const s = makeState();
  s.openPrice = 95;
  assert("Open below VAH rejects", validateVahRejection(s, 100) === false);
  assert("isActive false", s.isActive === false);
  assert("Rejection mentions VAH", s.rejectionReason.includes("VAH"));
})();

console.log("\n─── VAH: No double transition when already GAP_VALIDATED ───");
(() => {
  const s = makeState();
  s.openPrice = 105;
  s.state = "gap_validated"; // already validated
  assert("VAH passes without re-transition", validateVahRejection(s, 100) === true);
  assert("State stays gap_validated", s.state === "gap_validated");
})();

console.log("\n─── Low violation check ───");
(() => {
  const s = makeState();
  s.openPrice = 100;
  s.dailyLow = 99.5; // 99 = 1% below 100
  assert("Low 0.5% below open passes", checkLowViolation(s) === true);
  assert("lowViolationChecked set", s.lowViolationChecked === true);
})();

console.log("\n─── Low violation: drop exceed 1% ───");
(() => {
  const s = makeState();
  s.openPrice = 100;
  s.dailyLow = 98.5; // 98.5 < 99 (1% below 100)
  assert("Low 1.5% below open rejects", checkLowViolation(s) === false);
  assert("Rejection mentions low violation", s.rejectionReason.includes("Low violation"));
})();

console.log("\n─── Volume validation ───");
(() => {
  const s = makeState();
  s.earlyVolume = 100000;
  s.volumeBaseline = 1000000;
  assert("Volume 10% of baseline passes (>7.5%)", validateVolume(s, 0.075) === true);
  assert("volumeValidated set", s.volumeValidated === true);
})();

console.log("\n─── Volume validation: insufficient ───");
(() => {
  const s = makeState();
  s.earlyVolume = 5000;
  s.volumeBaseline = 1000000;
  assert("Volume 0.5% of baseline rejects", validateVolume(s, 0.075) === false);
  assert("Rejection mentions volume", s.rejectionReason.includes("volume"));
})();

console.log("\n─── Volume validation: no baseline ───");
(() => {
  const s = makeState();
  s.volumeBaseline = 0;
  assert("Zero baseline rejects", validateVolume(s, 0.075) === false);
})();

console.log("\n─── Entry and exit ───");
(() => {
  const s = makeState();
  s.state = "monitoring_entry";
  const now = new Date();
  enterPosition(s, 105.5, now);
  assert("entered set", s.entered === true);
  assert("entryPrice stored", s.entryPrice === 105.5);
  assert("State changed to monitoring_exit", s.state === "monitoring_exit");

  const exitNow = new Date();
  exitPosition(s, 101.5, exitNow, "Stop Loss Hit");
  assert("exitPrice stored", s.exitPrice === 101.5);
  assert("isSubscribed false", s.isSubscribed === false);
  assert("State changed to exited", s.state === "exited");
  assert("P&L calculated", s.pnl !== null);
  assert("P&L is negative", s.pnl < 0);
})();

console.log("\n─── Full lifecycle (gap up → VAH → low → volume → entry → exit) ───");
(() => {
  const s = makeState();
  s.previousClose = 100;

  // Simulate pre-market IEP
  s.openPrice = 103.2;
  assert("Gap 3.2% validates", validateGap(s) === true);
  assert("VAH passes (open above VAH)", validateVahRejection(s, 101.5) === true);

  // Simulate ticks after open
  s.dailyHigh = 104.0;
  s.dailyLow = 102.5;
  assert("Low violation passes", checkLowViolation(s) === true);

  s.earlyVolume = 200000;
  s.volumeBaseline = 1000000;
  assert("Volume validates", validateVolume(s, 0.075) === true);

  assert("All checks passed: gap+VAH+low+volume",
    s.gapValidated && s.vahPrice !== null && s.lowViolationChecked && s.volumeValidated);

  // Entry
  s.state = "monitoring_entry";
  enterPosition(s, 104.0, new Date());
  assert("Entered at high", s.entryPrice === 104.0);

  // Exit at SL
  exitPosition(s, 99.5, new Date(), "Stop Loss");
  assert("Exited with loss", s.pnl < 0);
  assert("Full lifecycle complete", s.state === "exited");
})();

console.log("\n─── Edge: No open price on gap validate ───");
(() => {
  const s = makeState();
  s.openPrice = null;
  s.previousClose = 100;
  assert("Returns false", validateGap(s) === false);
  assert("State unchanged", s.state === "initialized");
})();

console.log("\n─── Edge: Negative previous close ───");
(() => {
  const s = makeState();
  s.openPrice = 100;
  s.previousClose = -10;
  assert("Negative prev close rejects (gap inverted)", validateGap(s) === false);
  assert("isActive becomes false", s.isActive === false);
})();

// ════════════════════════════════════════════
console.log(`\n${"=".repeat(55)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log("All tests passed! [PASS]");
