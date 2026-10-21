"use client";

import { TableCell, Chip } from "@mui/material";
import { TrendingDown as DeclineIcon } from "@mui/icons-material";
import ScannerBase from "@/components/scanner/ScannerBase";
import type { ScannerBaseConfig } from "@/components/scanner/ScannerBase";
import { useAppState } from "@/lib/AppStateContext";
import type { ReversalResult, ScanRowPayload } from "@/lib/types";

const REV_FILTERS = [
  { key: "minPrice", label: "Min Price", def: 100, min: 10, max: 5000, parse: "int" as const, lsKey: "minPrice", saveSettingKey: "price_min", settingsKey: "price_min" },
  { key: "maxPrice", label: "Max Price", def: 10000, min: 100, max: 10000, parse: "int" as const, lsKey: "maxPrice", saveSettingKey: "price_max", settingsKey: "price_max" },
  { key: "minDeclinePct", label: "Min Decline %", def: 10, min: 5, max: 30, parse: "float" as const, lsKey: "minDeclinePct", saveSettingKey: "rev_min_decline_pct", settingsKey: "rev_min_decline_pct" },
];

const REV_CONFIG: ScannerBaseConfig<ReversalResult> = {
  mode: "reversal",
  resultsLabel: "reversal",
  icon: <DeclineIcon sx={{ color: "#f59e0b", fontSize: 20 }} />,
  palette: {
    primary: "#f59e0b",
    primaryHover: "#d97706",
    buttonText: "#0f172a",
    primaryBg: "rgba(245,158,11,0.15)",
    primaryHoverBg: "rgba(245,158,11,0.1)",
    accent: "#f59e0b",
    accentBg: "rgba(245,158,11,0.15)",
    accentHoverBg: "rgba(245,158,11,0.1)",
    accentTint: "rgba(245,158,11,0.08)",
  },
  filters: REV_FILTERS,
  scanFilters: (values) => ({
    min_price: values.minPrice,
    max_price: values.maxPrice,
    rev_min_decline_pct: values.minDeclinePct,
  }),
  postPayload: (row) => ({ symbol: row.symbol, close: row.close, trend_context: row.trend_context, period: row.period }),
  mapper: (raw: ScanRowPayload): ReversalResult => ({
    symbol: String(raw.symbol ?? ""),
    close: Number(raw.close ?? 0),
    period: Number(raw.period ?? 0),
    green_days: Number(raw.green_days ?? 0),
    first_red_date: String(raw.first_red_date ?? ""),
    decline_percent: Number(raw.decline_percent ?? 0),
    trend_context: String(raw.trend_context ?? ""),
    adr_pct: Number(raw.adr_pct ?? 0),
  }),
  columns: [
    { k: "symbol", l: "Symbol" },
    { k: "close", l: "Close" },
    { k: "period", l: "Period" },
    { k: "green_days", l: "Green Days" },
    { k: "first_red_date", l: "First Red" },
    { k: "decline_percent", l: "Decline %" },
    { k: "trend_context", l: "Trend" },
    { k: "adr_pct", l: "ADR %" },
  ],
  defaultSortKey: "decline_percent",
  renderCells: (row) => [
    <TableCell key="sym" sx={{ color: "#f8fafc", fontWeight: 600 }}>{row.symbol}</TableCell>,
    <TableCell key="close" sx={{ color: "#f8fafc" }}>₹{row.close.toFixed(2)}</TableCell>,
    <TableCell key="period" sx={{ color: "#f8fafc" }}>{row.period}</TableCell>,
    <TableCell key="days" sx={{ color: "#f8fafc" }}>{row.green_days}</TableCell>,
    <TableCell key="red" sx={{ color: "#f8fafc" }}>{row.first_red_date}</TableCell>,
    <TableCell key="decline" sx={{ color: "#ef4444", fontWeight: 600 }}>
      {(row.decline_percent * 100).toFixed(1)}%
    </TableCell>,
    <TableCell key="trend">
      <Chip
        label={row.trend_context}
        size="small"
        sx={{
          color: row.trend_context === "uptrend" ? "#10b981" : "#f59e0b",
          bgcolor: row.trend_context === "uptrend" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
          fontWeight: 600,
          border: `1px solid ${row.trend_context === "uptrend" ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
        }}
      />
    </TableCell>,
    <TableCell key="adr" sx={{ color: (row.adr_pct ?? 0) >= 3 ? "#10b981" : "#f8fafc" }}>
      {row.adr_pct.toFixed(1)}%
    </TableCell>,
  ],
  csvHeader: "Symbol,Close,Period,Green Days,First Red Date,Decline %,Trend,ADR %",
  csvRow: (r) =>
    `${r.symbol},${r.close.toFixed(2)},${r.period},${r.green_days},${r.first_red_date},${(r.decline_percent * 100).toFixed(2)}%,${r.trend_context},${r.adr_pct.toFixed(1)}`,
};

export default function ReversalScanner() {
  const { state, setReversalResults, setRevScanProgress, setReversalViewMode } = useAppState();
  return (
    <ScannerBase<ReversalResult>
      config={REV_CONFIG}
      results={state.reversalResults}
      setResults={setReversalResults}
      setProgress={setRevScanProgress}
      scanning={state.revScanProgress.scanning}
      progress={state.revScanProgress.progress}
      status={state.revScanProgress.status}
      operationId={state.revScanProgress.operationId}
      viewMode={state.reversalViewMode}
      setViewMode={setReversalViewMode}
    />
  );
}
