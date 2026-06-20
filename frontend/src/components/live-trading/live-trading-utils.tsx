"use client";

import { Chip, Box, Typography } from "@mui/material";

export const PY_API = "http://127.0.0.1:8001";
export const POLL_INTERVAL = 2000;

export type TradingMode = "continuation" | "reversal";

export interface StockStatus {
  symbol: string; state: string; currentPrice: number | null;
  dailyHigh: number; dailyLow: number; openPrice: number | null;
  previousClose: number; vahPrice: number | null;
  volumeBaseline: number; earlyVolume: number; cumulativeVolume: number; gapPct: number | null;
  entryPrice: number | null; exitPrice: number | null;
  pnl: number | null; entered: boolean; rejectionReason: string | null;
}

export interface PaperStats {
  totalTrades: number; wins: number; losses: number;
  winRate: number; totalPnl: number; capital: number;
  initialCapital: number;
}

export interface BotSummary {
  activeStocks: number; enteredPositions: number;
  stockDetails?: Record<string, StockStatus>;
}

export interface LiveStatus {
  running: boolean; mode: string; connected: boolean; subscribed: number;
  preMarketComplete: boolean; validatedCount: number;
  config: { marketOpen: string; prepStart: string; entryTime: string; } | null;
  reversal: BotSummary; continuation: BotSummary;
  paperTrader: PaperStats | null;
  logs?: string[];
}

export const stateColor: Record<string, string> = {
  initialized: "#94a3b8", waiting_for_open: "#facc15",
  gap_validated: "#60a5fa", qualified: "#818cf8",
  selected: "#a78bfa", waiting_for_entry: "#34d399",
  entered: "#10b981",
  exited: "#6b7280", rejected: "#ef4444",
  not_selected: "#9ca3af", unsubscribed: "#4b5563",
};

export const cardSx = {
  background: "linear-gradient(135deg, #111111 0%, #1a1a1a 100%)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3,
};

export function StateChip({ state }: { state: string }) {
  const color = stateColor[state] || "#94a3b8";
  const label = state.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Chip label={label} size="small" sx={{
      backgroundColor: `${color}22`, color, fontWeight: 600, fontSize: "0.7rem",
      border: `1px solid ${color}44`, fontFamily: "monospace",
      borderRadius: "4px", height: 22, "& .MuiChip-label": { px: 0.8 },
    }} />
  );
}

export function StatusDot({ connected }: { connected: boolean | null }) {
  const color = connected === null ? "#facc15" : connected ? "#10b981" : "#ef4444";
  return (
    <Box sx={{
      width: 10, height: 10, borderRadius: "50%", backgroundColor: color,
      boxShadow: `0 0 6px ${color}`, flexShrink: 0,
    }} />
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: "#64748b", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: color || "#f1f5f9", fontWeight: 700, fontFamily: "monospace", mt: 0.3 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function secondsUntilIST(targetIST: string): number {
  const p = targetIST.split(":").map(Number);
  let utcH = p[0] - 5, utcM = p[1] - 30;
  if (utcM < 0) { utcH -= 1; utcM += 60; }
  if (utcH < 0) utcH += 24;
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(utcH, utcM, p[2] || 0, 0);
  return Math.max(0, (target.getTime() - now.getTime()) / 1000);
}

export function formatCountdown(secs: number): string {
  if (secs <= 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseIST(t: string): number {
  const parts = t.split(":").map(Number);
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
}

export function getNextEvent(config: NonNullable<LiveStatus["config"]>, preMarketComplete: boolean, running: boolean): { label: string; target: string } | null {
  if (!running) return null;
  const now = new Date();
  const nowIST = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds() + (5 * 3600 + 30 * 60);
  const nowTotal = nowIST % 86400;

  const prepSec = parseIST(config.prepStart);
  const openSec = parseIST(config.marketOpen);
  const entrySec = parseIST(config.entryTime);

  if (nowTotal < prepSec) return { label: "PREP_START", target: config.prepStart };
  if (nowTotal < openSec && !preMarketComplete) return { label: "Pre-market", target: config.prepStart };
  if (nowTotal < openSec) return { label: "MARKET_OPEN", target: config.marketOpen };
  if (nowTotal < entrySec) return { label: "ENTRY_TIME", target: config.entryTime };
  return { label: "Trading active", target: "" };
}
