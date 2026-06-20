"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Card, CardContent, Tooltip, IconButton, Chip } from "@mui/material";
import { Edit, Delete, ChevronLeft, ChevronRight } from "@mui/icons-material";
import { PY_API, cardSx, Stat } from "./live-trading-utils";
import PnlDialog from "./PnlDialog";

interface TradeEntry {
  id: number; symbol: string; entry_price: number | null;
  entry_sl: number | null; entry_date: string; entry_time: string;
  exit_date: string | null; pnl_type: string | null; pnl_amount: number | null;
  trade_type?: string | null; quantity?: number; exit_price?: number | null;
}

interface DayPnl {
  entry_date: string; trade_count: number; net_pnl: number | null;
}

interface CapitalStats {
  initial_capital: number; realized_pnl: number;
  available_capital: number; open_position_value: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getHeatmapColor(day: DayPnl | undefined): string {
  if (!day || day.trade_count === 0) return "#1e293b";
  if (day.net_pnl === null) return "#e2e8f0";
  if (day.net_pnl > 0) return "#10b981";
  return "#ef4444";
}

function getHeatmapTooltip(day: DayPnl | undefined, dateStr: string): string {
  if (!day || day.trade_count === 0) return `${dateStr}: No trades`;
  if (day.net_pnl === null) return `${dateStr}: ${day.trade_count} trade(s), P&L not set`;
  return `${dateStr}: ${day.trade_count} trade(s), ${day.net_pnl >= 0 ? "+" : ""}${day.net_pnl.toFixed(2)}`;
}

function getTradeTypeLabel(t: string | null | undefined): { label: string; color: string } {
  if (t === "reversal_oops") return { label: "OOPS", color: "#a78bfa" };
  if (t === "reversal_ss") return { label: "SS", color: "#f59e0b" };
  return { label: "Cont", color: "#10b981" };
}

export default function TradeLogs() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [days, setDays] = useState<Record<string, DayPnl>>({});
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [stats, setStats] = useState<{ total_trades: number; profitable: number; losing: number; unsettled: number } | null>(null);
  const [capitalStats, setCapitalStats] = useState<CapitalStats | null>(null);
  const [editTrade, setEditTrade] = useState<TradeEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchAll = useCallback(() => {
    fetch(`${PY_API}/api/trades/yearly-pnl?year=${year}`).then(r => r.json())
      .then(d => {
        const m: Record<string, DayPnl> = {};
        for (const day of d.days || []) m[day.entry_date] = day;
        setDays(m);
      }).catch(() => setDays({}));
    fetch(`${PY_API}/api/trades/list`).then(r => r.json())
      .then(d => setTrades(d.trades || [])).catch(() => setTrades([]));
    fetch(`${PY_API}/api/trades/stats`).then(r => r.json())
      .then(d => setStats(d)).catch(() => setStats(null));
    fetch(`${PY_API}/api/trades/capital-stats`).then(r => r.json())
      .then(d => setCapitalStats(d)).catch(() => setCapitalStats(null));
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Poll only capital stats for live updates
  useEffect(() => {
    function pollCap() {
      fetch(`${PY_API}/api/trades/capital-stats`).then(r => r.json())
        .then(d => setCapitalStats(d)).catch(() => {});
    }
    pollCap();
    const id = setInterval(pollCap, 5000);
    return () => clearInterval(id);
  }, []);

  const first = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  const startDow = first.getDay();
  const startPad = new Date(first);
  startPad.setDate(startPad.getDate() - startDow);

  const allDates: Date[] = [];
  const cursor = new Date(startPad);
  while (cursor <= last) { allDates.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }

  const weeks: Date[][] = [];
  for (let i = 0; i < allDates.length; i += 7) weeks.push(allDates.slice(i, i + 7));

  const monthGroups: { label: string; startCol: number; span: number }[] = [];
  let cm = -1, ms = -1;
  weeks.forEach((week, wi) => {
    if (!week.length) return;
    const counts: Record<number, number> = {};
    for (const date of week) {
      if (date.getFullYear() !== year) continue;
      const m = date.getMonth();
      counts[m] = (counts[m] || 0) + 1;
    }
    if (Object.keys(counts).length === 0) return;
    const bestMonth = Number(
      Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    );
    if (bestMonth !== cm) {
      if (cm !== -1) monthGroups.push({ label: MONTHS[cm], startCol: ms, span: wi - ms });
      cm = bestMonth;
      ms = wi;
    }
  });
  if (cm !== -1) monthGroups.push({ label: MONTHS[cm], startCol: ms, span: weeks.length - ms });
  const monthEndCols = new Set(monthGroups.map(g => g.startCol + g.span - 1));

  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleEdit = (t: TradeEntry) => { setEditTrade(t); setDialogOpen(true); };
  const handleDelete = async (id: number) => { await fetch(`${PY_API}/api/trades/${id}`, { method: "DELETE" }).catch(() => {}); fetchAll(); };

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <Card sx={{ flex: 1, ...cardSx }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle2" sx={{ color: "#94a3b8", mb: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "0.75rem" }}>
              Trade Logs — {year}
            </Typography>
            <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Stat label="Total Entries" value={String(stats?.total_trades ?? 0)} />
              <Stat label="Profitable" value={String(stats?.profitable ?? 0)} color="#10b981" />
              <Stat label="Losing" value={String(stats?.losing ?? 0)} color="#ef4444" />
              <Stat label="Unsettled" value={String(stats?.unsettled ?? 0)} color="#f59e0b" />
            </Box>
          </CardContent>
        </Card>

        {capitalStats && (
          <Card sx={{ flex: 1, ...cardSx }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle2" sx={{ color: "#94a3b8", mb: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "0.75rem" }}>
                Capital
              </Typography>
              <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <Stat label="Initial Capital" value={`₹${capitalStats.initial_capital.toFixed(0)}`} />
                <Stat label="Available" value={`₹${capitalStats.available_capital.toFixed(0)}`} color="#10b981" />
                <Stat label="In Use" value={`₹${capitalStats.open_position_value.toFixed(0)}`} color="#f59e0b" />
                <Stat label="Realized P&L" value={`₹${capitalStats.realized_pnl.toFixed(0)}`}
                  color={capitalStats.realized_pnl >= 0 ? "#10b981" : "#ef4444"} />
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>

      <Card sx={{ ...cardSx, mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <IconButton onClick={() => setYear(y => y - 1)} size="small" sx={{ color: "#64748b" }}><ChevronLeft /></IconButton>
            <Typography variant="subtitle2" sx={{ color: "#f1f5f9", fontWeight: 700, fontFamily: "monospace", fontSize: "1rem" }}>{year}</Typography>
            <IconButton onClick={() => setYear(y => y + 1)} size="small" sx={{ color: "#64748b" }}><ChevronRight /></IconButton>
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", overflowX: "auto", pb: 1 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mr: 0.5, pt: 3 }}>
              {DAYS.map((d, i) => (
                <Box key={i} sx={{ height: 14, display: "flex", alignItems: "center" }}>
                  <Typography variant="caption" sx={{ color: "#64748b", fontSize: "0.6rem", lineHeight: 1 }}>{d}</Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <Box sx={{ display: "flex", gap: 0.5, mb: 0.5, ml: 0 }}>
                {monthGroups.map((m, gi) => (
                  <Box key={`${m.label}-${m.startCol}`} sx={{ width: m.span * 14 + (m.span - 1) * 4, mr: 1.5, textAlign: "left", flexShrink: 0 }}>
                    <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.6rem", fontWeight: 600 }}>{m.label}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {weeks.map((week, wi) => (
                  <Box key={wi} sx={{ display: "flex", flexDirection: "column", gap: 0.5, mr: monthEndCols.has(wi) ? 1.5 : 0 }}>
                    {week.map((date, di) => {
                      const key = fmt(date);
                      const day = days[key];
                      const inYear = date.getFullYear() === year;
                      const color = inYear ? getHeatmapColor(day) : "transparent";
                      return (
                        <Tooltip key={di} title={inYear ? getHeatmapTooltip(day, date.toDateString()) : ""}>
                          <Box sx={{
                            width: 14, height: 14, borderRadius: "3px",
                            backgroundColor: color,
                            cursor: inYear ? "pointer" : "default",
                            transition: "all 0.2s",
                            "&:hover": inYear ? { opacity: 0.8, transform: "scale(1.3)" } : {},
                          }} />
                        </Tooltip>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 2 }}>
            <Typography variant="caption" sx={{ color: "#64748b", fontSize: "0.65rem" }}>No trade</Typography>
            <Box sx={{ width: 12, height: 12, borderRadius: "2px", backgroundColor: "#1e293b" }} />
            <Typography variant="caption" sx={{ color: "#64748b", fontSize: "0.65rem" }}>Unsettled</Typography>
            <Box sx={{ width: 12, height: 12, borderRadius: "2px", backgroundColor: "#e2e8f0" }} />
            <Typography variant="caption" sx={{ color: "#64748b", fontSize: "0.65rem" }}>Profit</Typography>
            <Box sx={{ width: 12, height: 12, borderRadius: "2px", backgroundColor: "#10b981" }} />
            <Typography variant="caption" sx={{ color: "#64748b", fontSize: "0.65rem" }}>Loss</Typography>
            <Box sx={{ width: 12, height: 12, borderRadius: "2px", backgroundColor: "#ef4444" }} />
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ ...cardSx }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle2" sx={{ color: "#94a3b8", mb: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "0.75rem" }}>
            Trade Log ({trades.length})
          </Typography>
          {trades.length === 0 ? (
            <Typography variant="body2" sx={{ color: "#4b5563", py: 4, textAlign: "center" }}>No trades logged yet.</Typography>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: "0.8rem" }}>
                <Box component="thead">
                  <Box component="tr" sx={{ "& > th": { borderBottom: "1px solid rgba(255,255,255,0.06)", p: 1.5, textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px" } }}>
                    <Box component="th">Symbol</Box>
                    <Box component="th">Type</Box>
                    <Box component="th">Qty</Box>
                    <Box component="th">Used Capital</Box>
                    <Box component="th">Entry</Box>
                    <Box component="th">Stop Loss</Box>
                    <Box component="th">Exit Price</Box>
                    <Box component="th">Date</Box>
                    <Box component="th">Exit Date</Box>
                    <Box component="th">P&L</Box>
                    <Box component="th" sx={{ textAlign: "center" }}>Edit</Box>
                  </Box>
                </Box>
                <Box component="tbody">
                  {trades.map((t) => {
                    const isProfit = t.pnl_type === "profit";
                    const isLoss = t.pnl_type === "loss";
                    const tl = getTradeTypeLabel(t.trade_type);
                    return (
                      <Box component="tr" key={t.id} sx={{ "& > td": { p: 1.5, borderBottom: "1px solid rgba(255,255,255,0.03)", color: "#cbd5e1" }, "&:hover": { bgcolor: "rgba(255,255,255,0.02)" } }}>
                        <Box component="td" sx={{ fontWeight: 700, color: "#f1f5f9" }}>{t.symbol}</Box>
                        <Box component="td">
                          <Chip label={tl.label} size="small"
                            sx={{ backgroundColor: `${tl.color}22`, color: tl.color, fontWeight: 700, fontSize: "0.65rem", borderRadius: "4px", height: 20 }} />
                        </Box>
                        <Box component="td">{t.quantity ?? 100}</Box>
                        <Box component="td" sx={{ color: "#f59e0b", fontWeight: 600 }}>
                          {t.entry_price && t.quantity ? `₹${(t.entry_price * t.quantity).toFixed(0)}` : "—"}
                        </Box>
                        <Box component="td">{t.entry_price ? `₹${t.entry_price.toFixed(2)}` : "—"}</Box>
                        <Box component="td">
                          {t.entry_sl && t.entry_price ? (
                            <Box component="span">{`₹${t.entry_sl.toFixed(2)}`}
                              <Box component="span" sx={{ color: "#94a3b8", ml: 0.5, fontSize: "0.65rem" }}>
                                ({Math.round((1 - t.entry_sl / t.entry_price) * 100)}%)
                              </Box>
                            </Box>
                          ) : "—"}
                        </Box>
                        <Box component="td">{t.exit_price ? `₹${t.exit_price.toFixed(2)}` : "—"}</Box>
                        <Box component="td">{t.entry_date || "—"}</Box>
                        <Box component="td">{t.exit_date || "—"}</Box>
                        <Box component="td">
                          {isProfit ? (
                            <Typography variant="body2" sx={{ color: "#10b981", fontWeight: 700, fontFamily: "monospace" }}>
                              +₹{Math.abs(t.pnl_amount ?? 0).toFixed(0)}
                            </Typography>
                          ) : isLoss ? (
                            <Typography variant="body2" sx={{ color: "#ef4444", fontWeight: 700, fontFamily: "monospace" }}>
                              -₹{Math.abs(t.pnl_amount ?? 0).toFixed(0)}
                            </Typography>
                          ) : (
                            <Typography variant="body2" sx={{ color: "#4b5563", fontFamily: "monospace" }}>—</Typography>
                          )}
                        </Box>
                        <Box component="td" sx={{ textAlign: "center" }}>
                          <IconButton size="small" onClick={() => handleEdit(t)} sx={{ color: "#64748b", "&:hover": { color: "#818cf8" } }}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDelete(t.id)} sx={{ color: "#64748b", "&:hover": { color: "#ef4444" } }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <PnlDialog open={dialogOpen} trade={editTrade} onClose={() => setDialogOpen(false)} onSaved={fetchAll} />
    </Box>
  );
}
