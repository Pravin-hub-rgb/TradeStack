"use client";

import { Box, Typography } from "@mui/material";

interface ContStats {
  symbol: string;
  close: number;
  dist_to_ma_pct?: number;
  phase1_high?: number;
  phase2_low?: number;
  depth_pct?: number;
  adr_pct: number;
}

interface RevStats {
  symbol: string;
  close: number;
  period: number;
  green_days: number;
  first_red_date: string;
  decline_percent: number;
  trend_context: string;
  adr_pct: number;
}

type Stats = ContStats | RevStats;

function isRev(stats: Stats): stats is RevStats {
  return "period" in stats;
}

interface Props {
  stats: Stats;
  sx?: any;
}

export default function StockTooltip({ stats, sx }: Props) {
  return (
    <Box
      sx={{
        bgcolor: "#111827",
        border: "1px solid #334155",
        borderRadius: 2,
        p: 1.5,
        minWidth: 180,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        ...sx,
      }}
    >
      <Typography sx={{ color: "#f1f5f9", fontWeight: 700, fontSize: "0.85rem", mb: 1 }}>
        {stats.symbol}
      </Typography>
      {isRev(stats) ? (
        <>
          <Row label="Close" value={`₹${stats.close.toFixed(2)}`} />
          <Row label="Period" value={`${stats.period}d`} />
          <Row label="Green Days" value={`${stats.green_days}`} />
          <Row label="First Red" value={stats.first_red_date} />
          <Row label="Decline" value={`${(stats.decline_percent * 100).toFixed(1)}%`} color="#ef4444" />
          <Row label="Trend" value={stats.trend_context} color={stats.trend_context === "uptrend" ? "#10b981" : "#f59e0b"} />
          <Row label="ADR" value={`${stats.adr_pct.toFixed(1)}%`} color={stats.adr_pct >= 3 ? "#10b981" : undefined} />
        </>
      ) : (
        <>
          <Row label="Close" value={`₹${stats.close.toFixed(2)}`} />
          <Row label="ADR" value={`${stats.adr_pct.toFixed(1)}%`} color={stats.adr_pct >= 3 ? "#10b981" : undefined} />
          <Row label="Dist to MA" value={`${(stats.dist_to_ma_pct ?? 0).toFixed(1)}%`} color={(stats.dist_to_ma_pct ?? 0) <= 5 ? "#10b981" : undefined} />
          <Row label="Phase1 High" value={`₹${(stats.phase1_high ?? 0).toFixed(2)}`} />
          <Row label="Phase2 Low" value={`₹${(stats.phase2_low ?? 0).toFixed(2)}`} />
          <Row label="Depth" value={`${(stats.depth_pct ?? 0).toFixed(1)}%`} />
        </>
      )}
    </Box>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.3 }}>
      <Typography sx={{ color: "#64748b", fontSize: "0.75rem" }}>{label}</Typography>
      <Typography sx={{ color: color ?? "#e2e8f0", fontSize: "0.75rem", fontWeight: 600, textAlign: "right" }}>
        {value}
      </Typography>
    </Box>
  );
}
