import { NextRequest, NextResponse } from "next/server";
import { LiveTraderOrchestrator, BotMode } from "@/lib/live-trader/index";
import type { LiveTraderConfig } from "@/lib/live-trader/types";
import { broadcast } from "./events/route";

const PY_API = "http://127.0.0.1:8001";

let reversalOrchestrator: LiveTraderOrchestrator | null = null;
let continuationOrchestrator: LiveTraderOrchestrator | null = null;
let _instMap: Record<string, string> | null = null;
let logsBuffer: string[] = [];

function addLog(msg: string) {
  const t = new Date().toLocaleTimeString("en-IN", { hour12: false });
  const entry = `[${t}] ${msg}`;
  logsBuffer.push(entry);
  if (logsBuffer.length > 200) logsBuffer = logsBuffer.slice(-200);
  broadcast(JSON.stringify({ type: "log", timestamp: t, message: msg }));
}
(globalThis as any).__addLiveLog = addLog;

async function resolveInstrumentKeys(symbols: string[]): Promise<Record<string, string>> {
  if (_instMap) return _instMap;
  try {
    const r = await fetch(`${PY_API}/api/instrument-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    if (!r.ok) return {};
    const data = await r.json();
    _instMap = data.keys || {};
    return _instMap as Record<string, string>;
  } catch {
    return {};
  }
}

function getOrCreate(mode: BotMode): LiveTraderOrchestrator {
  if (mode === "reversal") {
    if (!reversalOrchestrator) {
      reversalOrchestrator = new LiveTraderOrchestrator("reversal");
    }
    return reversalOrchestrator;
  }
  if (!continuationOrchestrator) {
    continuationOrchestrator = new LiveTraderOrchestrator("continuation");
  }
  return continuationOrchestrator;
}

function parseTime(t: string): Date {
  const [h, m, s = "0"] = t.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m), Number(s), 0);
  return d;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = ((Math.floor(total / 60) % 24) + 24) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function subtractSeconds(time: string, secs: number): string {
  const parts = time.split(":").map(Number);
  const h = parts[0], m = parts[1], s = parts[2] || 0;
  let total = h * 3600 + m * 60 + s - secs;
  if (total < 0) total = 0;
  const nh = Math.floor(total / 3600);
  const nm = Math.floor((total % 3600) / 60);
  const ns = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:${String(ns).padStart(2, "0")}`;
}

async function loadConfigFromPython(): Promise<LiveTraderConfig> {
  const [settingsR, tokenR] = await Promise.all([
    fetch(`${PY_API}/api/settings`).catch(() => null),
    fetch(`${PY_API}/api/token/raw`).catch(() => null),
  ]);

  const arr: any[] = settingsR?.ok
    ? (await settingsR.json()).settings || []
    : [];
  const s: Record<string, string> = {};
  for (const item of arr) {
    if (item.key) s[item.key] = item.value;
  }

  const tokenData = tokenR?.ok ? await tokenR.json() : {};
  const accessToken = tokenData.token || "";

  const mo = s["market_open"] || "09:15";
  const windowLen = Number(s["entry_window_minutes"]) || 5;
  const prepOffset = Number(s["prep_start_offset_seconds"]) || 30;
  const entryStr = addMinutes(mo, windowLen);
  const prepStr = subtractSeconds(mo, prepOffset);

  return {
    accessToken,
    marketOpen: mo,
    marketOpenTime: parseTime(mo),
    marketCloseTime: parseTime(s["market_close"] || "15:30"),
    windowLength: windowLen,
    entryTime: entryStr,
    prepStart: prepStr,
    maxPositions: Number(s["max_positions"]) || 2,
    capital: Number(s["trading_capital"]) || 100000,
    quantity: Number(s["trading_quantity"]) || 100,
    entrySlPct: (Number(s["entry_sl_pct"]) || 4) / 100,
    lowViolationPct: (Number(s["low_violation_pct"]) || 1) / 100,
    flatGapThreshold: (Number(s["flat_gap_threshold"]) || 0.3) / 100,
    trailingSlThreshold: (Number(s["trailing_sl_threshold"]) || 5) / 100,
    svroMinVolumeRatio: (Number(s["svro_min_volume_ratio"]) || 7.5) / 100,
    gapUpMaxPct: (Number(s["gap_up_max_pct"]) || 5) / 100,
    paperTrading: s["paper_trading"] !== "false",
    riskPerTrade: Number(s["risk_per_trade"]) || Number(s["trading_capital"]) * (Number(s["risk_per_trade_pct"]) || 0.5) / 100,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") as BotMode | null;

  if (mode === "reversal") {
    const s = reversalOrchestrator?.getStatus() ?? { running: false };
    return NextResponse.json({ ...s, logs: logsBuffer });
  }
  if (mode === "continuation") {
    const s = continuationOrchestrator?.getStatus() ?? { running: false };
    return NextResponse.json({ ...s, logs: logsBuffer });
  }

  // Default: return both (for UI discovery)
  return NextResponse.json({
    reversal: reversalOrchestrator?.getStatus() ?? { running: false },
    continuation: continuationOrchestrator?.getStatus() ?? { running: false },
    logs: logsBuffer,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, mode: rawMode } = body;
    const mode: BotMode = rawMode === "reversal" ? "reversal" : "continuation";
    const o = getOrCreate(mode);

    if (action === "start") {
      if (o.running) {
        return NextResponse.json({ error: `${mode} bot is already running` }, { status: 400 });
      }
      const config = await loadConfigFromPython();
      const stocksCount = body.stocks?.length || 0;
      addLog(`Starting ${mode} bot with ${stocksCount} stocks`);
      await o.initialize(config, body.instruments || [], body.stocks);
      o.start().catch((err) => { addLog(`Start error: ${err.message}`); console.error("[API] start error:", err); });
      return NextResponse.json({ status: "starting", mode, tokenExists: !!config.accessToken });
    }

    if (action === "stop") {
      addLog(`Stopping ${mode} bot...`);
      await o.stop();
      addLog(`${mode} bot stopped`);
      return NextResponse.json({ status: "stopped", mode });
    }

    if (action === "load") {
      const { scannerResult } = body;
      if (!scannerResult) {
        return NextResponse.json({ error: "scannerResult required" }, { status: 400 });
      }

      const source = mode === "reversal" ? scannerResult.reversal : scannerResult.continuation;
      if (!source) {
        return NextResponse.json({ error: `No ${mode} stocks in scanner result` }, { status: 400 });
      }

      const allSymbols = source.stocks?.map((s: any) => s.symbol) || [];
      addLog(`Loading ${allSymbols.length} ${mode} stocks`);
      const keyMap = await resolveInstrumentKeys(allSymbols);

      const fixed = JSON.parse(JSON.stringify(source));
      for (const stock of fixed.stocks || []) {
        const correctKey = keyMap[stock.symbol];
        if (correctKey) stock.instrumentKey = correctKey;
      }

      const scannerResultFixed = mode === "reversal"
        ? { reversal: fixed, continuation: null }
        : { reversal: null, continuation: fixed };

      await o.loadStocksFromScanner(scannerResultFixed as any);
      addLog(`Loaded ${Object.keys(keyMap).length} ${mode} stocks`);
      return NextResponse.json({ status: "loaded", mode, count: Object.keys(keyMap).length, missing: allSymbols.length - Object.keys(keyMap).length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
