"use client";

import { TableCell, Typography, Chip } from "@mui/material";
import { Assessment as ResultsIcon } from "@mui/icons-material";
import ScannerBase from "@/components/scanner/ScannerBase";
import type { ScannerBaseConfig } from "@/components/scanner/ScannerBase";
import { useAppState } from "@/lib/AppStateContext";
import type { ScanResult, ScanRowPayload } from "@/lib/types";

const CONT_FILTERS = [
  { key: "minPrice", label: "Min Price", def: 100, min: 10, max: 5000, parse: "int" as const, lsKey: "minPrice", saveSettingKey: "price_min", settingsKey: "price_min" },
  { key: "maxPrice", label: "Max Price", def: 10000, min: 100, max: 10000, parse: "int" as const, lsKey: "maxPrice", saveSettingKey: "price_max", settingsKey: "price_max" },
  { key: "nearMa", label: "Near MA %", def: 5, min: 1, max: 20, parse: "int" as const, lsKey: "nearMa", saveSettingKey: "cont_near_ma_threshold_pct", settingsKey: "cont_near_ma_threshold_pct" },
  { key: "maxBody", label: "Max Body %", def: 5, min: 1, max: 10, parse: "int" as const, lsKey: "maxBody", saveSettingKey: "cont_max_body_pct", settingsKey: "cont_max_body_pct" },
  { key: "risingMaTol", label: "Rising MA Tol %", def: 0, min: 0, max: 5, parse: "int" as const, lsKey: "risingMaTol", saveSettingKey: "cont_rising_ma_tolerance_pct", settingsKey: "cont_rising_ma_tolerance_pct" },
];

const CONT_CONFIG: ScannerBaseConfig<ScanResult> = {
  mode: "continuation",
  resultsLabel: "continuation",
  icon: <ResultsIcon sx={{ color: "#10b981", fontSize: 20 }} />,
  palette: {
    primary: "#6366f1",
    primaryHover: "#4f46e5",
    buttonText: "#fff",
    primaryBg: "rgba(99,102,241,0.15)",
    primaryHoverBg: "rgba(99,102,241,0.1)",
    accent: "#10b981",
    accentBg: "rgba(16,185,129,0.15)",
    accentHoverBg: "rgba(16,185,129,0.1)",
    accentTint: "rgba(16,185,129,0.08)",
  },
  filters: CONT_FILTERS,
  direction: {
    lsKey: "nearMaDirection",
    settingsKey: "cont_near_ma_direction",
    def: "above",
    options: ["above", "below", "both"],
  },
  scanFilters: (values, direction) => ({
    min_price: values.minPrice,
    max_price: values.maxPrice,
    near_ma_threshold: values.nearMa,
    near_ma_direction: direction,
    max_body_percentage: values.maxBody,
    rising_ma_tolerance: values.risingMaTol,
  }),
  postPayload: (row) => ({ symbol: row.symbol, close: row.close, depth_pct: row.depth_pct ?? null }),
  mapper: (raw: ScanRowPayload): ScanResult => ({
    symbol: String(raw.symbol ?? ""),
    close: Number(raw.close ?? 0),
    sma20: raw.sma20 != null ? Number(raw.sma20) : undefined,
    dist_to_ma_pct: raw.dist_to_ma_pct != null ? Number(raw.dist_to_ma_pct) : undefined,
    phase1_high: raw.phase1_high != null ? Number(raw.phase1_high) : undefined,
    phase2_low: raw.phase2_low != null ? Number(raw.phase2_low) : undefined,
    depth_pct: raw.depth_pct != null ? Number(raw.depth_pct) : undefined,
    adr_pct: Number(raw.adr_pct ?? 0),
  }),
  columns: [
    { k: "symbol", l: "Symbol" },
    { k: "close", l: "Close" },
    { k: "dist_to_ma_pct", l: "Dist to MA %" },
    { k: "phase1_high", l: "Phase1 High" },
    { k: "phase2_low", l: "Phase2 Low" },
    { k: "depth_pct", l: "Depth %" },
    { k: "adr_pct", l: "ADR %" },
  ],
  defaultSortKey: "depth_pct",
  renderCells: (row) => [
    <TableCell key="sym" sx={{ color: "#f8fafc", fontWeight: 600 }}>{row.symbol}</TableCell>,
    <TableCell key="close" sx={{ color: "#f8fafc" }}>₹{row.close.toFixed(2)}</TableCell>,
    <TableCell key="dist" sx={{ color: (row.dist_to_ma_pct ?? 0) <= 5 ? "#10b981" : "#f8fafc" }}>
      {(row.dist_to_ma_pct ?? 0).toFixed(1)}%
    </TableCell>,
    <TableCell key="p1" sx={{ color: "#f8fafc" }}>₹{(row.phase1_high ?? 0).toFixed(2)}</TableCell>,
    <TableCell key="p2" sx={{ color: "#f8fafc" }}>₹{(row.phase2_low ?? 0).toFixed(2)}</TableCell>,
    <TableCell key="depth" sx={{ color: "#f8fafc" }}>{(row.depth_pct ?? 0).toFixed(1)}%</TableCell>,
    <TableCell key="adr" sx={{ color: (row.adr_pct ?? 0) >= 3 ? "#10b981" : "#f8fafc" }}>
      {row.adr_pct.toFixed(1)}%
    </TableCell>,
  ],
  csvHeader: "Symbol,Close,SMA20,Dist to MA %,Phase1 High,Phase2 Low,Depth %,ADR %",
  csvRow: (r) =>
    `${r.symbol},${r.close.toFixed(2)},${(r.sma20 || 0).toFixed(2)},${(r.dist_to_ma_pct || 0).toFixed(1)},${(r.phase1_high || 0).toFixed(2)},${(r.phase2_low || 0).toFixed(2)},${(r.depth_pct || 0).toFixed(1)},${r.adr_pct.toFixed(1)}`,
};

export default function ContinuationScanner() {
  const { state, setContinuationResults, setContScanProgress, setContinuationViewMode } = useAppState();
  return (
    <ScannerBase<ScanResult>
      config={CONT_CONFIG}
      results={state.continuationResults}
      setResults={setContinuationResults}
      setProgress={setContScanProgress}
      scanning={state.contScanProgress.scanning}
      progress={state.contScanProgress.progress}
      status={state.contScanProgress.status}
      operationId={state.contScanProgress.operationId}
      viewMode={state.continuationViewMode}
      setViewMode={setContinuationViewMode}
    />
  );
}
