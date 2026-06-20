"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, IconButton, Tooltip,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon } from "@mui/icons-material";
import StockChart from "./StockChart";
import StockTooltip from "./StockTooltip";

const API = "http://127.0.0.1:8001";

interface ContStats {
  symbol: string; close: number; sma20?: number; dist_to_ma_pct?: number;
  phase1_high?: number; phase2_low?: number; depth_pct?: number; adr_pct: number;
}

interface RevStats {
  symbol: string; close: number; period: number; green_days: number;
  first_red_date: string; decline_percent: number; trend_context: string; adr_pct: number;
}

type Stock = ContStats | RevStats;

interface CandleData {
  candles: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
  sma: { date: string; value: number }[];
}

interface Props {
  stocks: Stock[];
  mode: "continuation" | "reversal";
  savedSymbols: string[];
  onToggle: (row: any) => void;
  chartCacheRef?: { current: Record<string, CandleData> };
}

export default function ScannerSplitPane({ stocks, mode, savedSymbols, onToggle, chartCacheRef }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [chartData, setChartData] = useState<Record<string, CandleData>>({});
  const [loaded, setLoaded] = useState(false);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = stocks[selectedIdx];

  const fetchBatch = useCallback(async () => {
    if (stocks.length === 0) return;
    const symbols = stocks.map(s => s.symbol);
    try {
      const r = await fetch(`${API}/api/data/batch-stock-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, days: 200 }),
      });
      const d = await r.json();
      setChartData(d.data || {});
    } catch {}
    setLoaded(true);
  }, [stocks]);

  useEffect(() => {
    setSelectedIdx(0);
    const cached = chartCacheRef?.current;
    const symbols = stocks.map(s => s.symbol);
    const allCached = cached && symbols.every(s => cached[s] && cached[s].candles.length > 0);
    if (allCached) {
      setChartData(cached);
      setLoaded(true);
      return;
    }
    setChartData({});
    setLoaded(false);
    fetchBatch();
  }, [fetchBatch, chartCacheRef, stocks]);

  useEffect(() => {
    if (loaded && chartCacheRef && Object.keys(chartData).length > 0) {
      chartCacheRef.current = chartData;
    }
  }, [chartData, loaded, chartCacheRef]);

  const current = selected ? chartData[selected.symbol] : null;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, stocks.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    }
  }, [stocks.length]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIdx] as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIdx]);

  const isRev = mode === "reversal";

  return (
    <Box sx={{ display: "flex", gap: 2, height: 540 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {!loaded ? (
          <Box sx={{ color: "#64748b", fontSize: "0.85rem", py: 4, textAlign: "center" }}>
            Loading chart data...
          </Box>
        ) : current && current.candles.length > 0 ? (
          <>
            <StockChart symbol={selected.symbol} candles={current.candles} sma={current.sma} height={480} />
            <Box sx={{ px: 1, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              {isRev ? (
                <>
                  <MiniStat label="Close" value={`₹${(selected as RevStats).close.toFixed(2)}`} />
                  <MiniStat label="ADR" value={`${(selected as RevStats).adr_pct.toFixed(1)}%`} color={(selected as RevStats).adr_pct >= 3 ? "#10b981" : undefined} />
                  <MiniStat label="Period" value={`${(selected as RevStats).period}d`} />
                  <MiniStat label="Decline" value={`${((selected as RevStats).decline_percent * 100).toFixed(1)}%`} color="#ef4444" />
                  <MiniStat label="Trend" value={(selected as RevStats).trend_context} color={(selected as RevStats).trend_context === "uptrend" ? "#10b981" : "#f59e0b"} />
                  <MiniStat label="Green Days" value={`${(selected as RevStats).green_days}`} />
                </>
              ) : (
                <>
                  <MiniStat label="Close" value={`₹${(selected as ContStats).close.toFixed(2)}`} />
                  <MiniStat label="ADR" value={`${(selected as ContStats).adr_pct.toFixed(1)}%`} color={(selected as ContStats).adr_pct >= 3 ? "#10b981" : undefined} />
                  <MiniStat label="Dist to MA" value={`${((selected as ContStats).dist_to_ma_pct ?? 0).toFixed(1)}%`} color={((selected as ContStats).dist_to_ma_pct ?? 0) <= 5 ? "#10b981" : undefined} />
                  <MiniStat label="Phase1 Hi" value={`₹${((selected as ContStats).phase1_high ?? 0).toFixed(2)}`} />
                  <MiniStat label="Phase2 Lo" value={`₹${((selected as ContStats).phase2_low ?? 0).toFixed(2)}`} />
                  <MiniStat label="Depth" value={`${((selected as ContStats).depth_pct ?? 0).toFixed(1)}%`} />
                </>
              )}
            </Box>
          </>
        ) : (
          <Box sx={{ color: "#64748b", fontSize: "0.85rem", py: 8, textAlign: "center" }}>
            No chart data for {selected?.symbol}
          </Box>
        )}
      </Box>

      <Box
        ref={listRef}
        sx={{
          width: 220,
          flexShrink: 0,
          height: "100%",
          overflowY: "auto",
          bgcolor: "#0d1117",
          border: "1px solid #1e293b",
          borderRadius: 2,
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { bgcolor: "#334155", borderRadius: 2 },
        }}
      >
        {stocks.map((s, i) => {
          const isSelected = i === selectedIdx;
          const inList = savedSymbols.includes(s.symbol);
          return (
            <Box
              key={s.symbol}
              onClick={() => setSelectedIdx(i)}
              onMouseEnter={(e) => {
                if (hoverTimer.current) clearTimeout(hoverTimer.current);
                hoverTimer.current = setTimeout(() => {
                  setHoveredSymbol(s.symbol);
                  setHoverPos({ x: e.clientX, y: e.clientY });
                }, 300);
              }}
              onMouseLeave={() => {
                if (hoverTimer.current) clearTimeout(hoverTimer.current);
                setHoveredSymbol(null);
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.5,
                py: 1,
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                bgcolor: isSelected ? "rgba(99,102,241,0.12)" : "transparent",
                borderLeft: isSelected ? "3px solid #6366f1" : "3px solid transparent",
                transition: "all 0.15s",
                "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
              }}
            >
              <Typography
                sx={{
                  flex: 1,
                  color: isSelected ? "#f1f5f9" : "#94a3b8",
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: "0.85rem",
                  fontFamily: '"SF Mono", "Fira Code", monospace',
                }}
              >
                {s.symbol}
              </Typography>
              <Tooltip title={inList ? "Remove" : "Add"} placement="left">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onToggle(s); }}
                  sx={{ color: inList ? "#ef4444" : "#475569", p: 0.3 }}
                >
                  {inList ? <CloseIcon sx={{ fontSize: 14 }} /> : <AddIcon sx={{ fontSize: 14 }} />}
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}
      </Box>

      {hoveredSymbol && (() => {
        const stk = stocks.find(s => s.symbol === hoveredSymbol);
        if (!stk) return null;
        return (
          <Box sx={{ position: "fixed", left: hoverPos.x + 12, top: hoverPos.y - 80, zIndex: 9999, pointerEvents: "none" }}>
            <StockTooltip stats={stk as any} />
          </Box>
        );
      })()}
    </Box>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Typography sx={{ color: "#64748b", fontSize: "0.7rem" }}>{label}</Typography>
      <Typography sx={{ color: color ?? "#e2e8f0", fontSize: "0.75rem", fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}
