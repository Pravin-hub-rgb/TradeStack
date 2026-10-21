/**
 * ScannerBase — config-driven shared engine for the Continuation and
 * Reversal scanners. A thin declarative config (filters, columns, palette,
 * payload builders) makes each scanner a ~60-line wrapper.
 *
 * Owns: filter state + hydration (useScannerFilters), saved list, status
 * polling, toast strip, result card/menu, tables, chart split pane, CSV
 * export and clipboard copy.
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { Box, Card, CardContent, IconButton, Tooltip, Typography } from "@mui/material";
import {
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  ShowChart as ChartIcon,
  TableChart as TableIcon,
} from "@mui/icons-material";
import { PY_API } from "@/lib/api";
import type { CandleData, ScanRowPayload } from "@/lib/types";
import type { ScanProgress } from "@/lib/AppStateContext";
import { useToastStack } from "@/lib/hooks/useToastStack";
import ToastNotification from "@/components/ToastNotification";
import CandleProgress from "@/components/CandleProgress";
import ScannerSplitPane from "@/components/scanner/ScannerSplitPane";
import FilterBar from "@/components/scanner/FilterBar";
import ScannerTable from "@/components/scanner/ScannerTable";
import { useScannerFilters, type ScannerFilterDef, type ScannerDirectionDef } from "@/components/scanner/useScannerFilters";
import { useScannerStatusPoll, type ScannerRowUnion } from "@/components/scanner/useScannerStatusPoll";
import { useSavedList } from "@/components/scanner/useSavedList";
import type { ReactNode } from "react";

export interface ScannerPalette {
  /** Run button + table-sorted header + table-view active icon. */
  primary: string;
  primaryHover: string;
  buttonText: string;
  primaryBg: string;
  primaryHoverBg: string;
  /** Results card border-left, header icon, row toggle, chart-view active. */
  accent: string;
  accentBg: string;
  accentHoverBg: string;
  accentTint: string;
}

export interface ScannerBaseConfig<R extends ScannerRowUnion> {
  mode: "continuation" | "reversal";
  /** Copy fragments, e.g. "Found N continuation setups". */
  resultsLabel: string;
  icon: ReactNode;
  palette: ScannerPalette;
  filters: ScannerFilterDef[];
  direction?: ScannerDirectionDef;
  scanFilters: (values: Record<string, number>, direction: string) => Record<string, unknown>;
  postPayload: (row: R) => Record<string, unknown>;
  mapper: (raw: ScanRowPayload) => R;
  columns: { k: keyof R & string; l: string }[];
  defaultSortKey: keyof R & string;
  /** Cells after the toggle column (i.e. from "Symbol" onwards). */
  renderCells: (row: R) => ReactNode[];
  csvHeader: string;
  csvRow: (row: R) => string;
}

export interface ScannerBaseProps<R extends ScannerRowUnion> {
  config: ScannerBaseConfig<R>;
  results: R[];
  setResults: (rows: R[]) => void;
  setProgress: (p: ScanProgress) => void;
  scanning: boolean;
  progress: number;
  status: string;
  operationId: string | null;
  viewMode: "table" | "chart";
  setViewMode: (m: "table" | "chart") => void;
}

export default function ScannerBase<R extends ScannerRowUnion>(props: ScannerBaseProps<R>) {
  const { config } = props;
  const { mode, resultsLabel, palette } = config;
  const prefix = mode === "continuation" ? "cont" : "rev";
  const { results, setResults, setProgress, scanning, progress, status, operationId, viewMode, setViewMode } = props;

  const cardSx = {
    background: "linear-gradient(135deg, #111111 0%, #1a1a1a 100%)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 3,
  };

  const { toasts, showToast, removeToast } = useToastStack();

  const { values, setValue, directionValue, setDirectionValue, scanDate, setScanDate } =
    useScannerFilters(prefix, config.filters, config.direction);

  const { savedSymbols, toggleInList } = useSavedList(mode, showToast);

  const chartCacheRef = useRef<Record<string, CandleData>>({});

  const [sortKey, setSortKey] = useState<keyof R & string>(config.defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    // Controlled cast: only column keys emitted by ScannerTable flow here.
    const k = key as keyof R & string;
    const dir = sortKey === k && sortDir === "asc" ? "desc" : "asc";
    setSortKey(k);
    setSortDir(dir);
    const sorted = [...results].sort((a, b) => {
      const av = a[k] ?? 0;
      const bv = b[k] ?? 0;
      if (typeof av === "string" || typeof bv === "string") {
        const as = String(av);
        const bs = String(bv);
        return dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      }
      const an = Number(av);
      const bn = Number(bv);
      return dir === "asc" ? an - bn : bn - an;
    });
    setResults(sorted);
  };

  const toggleRow = useCallback(
    async (row: R) => {
      await toggleInList(row.symbol, config.postPayload(row));
    },
    [toggleInList, config],
  );

  const onExpired = useCallback(() => {
    setProgress({ scanning: false, progress: 0, status: "Scan expired (server was restarted)", operationId: null });
  }, [setProgress]);

  const onProgress = useCallback(
    (p: number, s: string) => {
      setProgress({ scanning: true, progress: p, status: s, operationId });
    },
    [setProgress, operationId],
  );

  const onComplete = useCallback(
    (rows: R[]) => {
      setResults(rows);
      setProgress({ scanning: false, progress: 100, status: `Scan completed! Found ${rows.length} ${resultsLabel} setups`, operationId: null });
      showToast(`Found ${rows.length} ${resultsLabel} setups`, "success");
    },
    [setResults, setProgress, resultsLabel, showToast],
  );

  const onError = useCallback(
    (message: string) => {
      setProgress({ scanning: false, progress: 0, status: `Scan failed: ${message}`, operationId: null });
      showToast(`Scan failed: ${message}`, "error");
    },
    [setProgress, showToast],
  );

  const onLostConnection = useCallback(() => {
    setProgress({ scanning: false, progress: 0, status: "Lost connection to scan process", operationId: null });
    showToast("Lost connection to scan process", "error");
  }, [setProgress, showToast]);

  useScannerStatusPoll<R>({
    scanning,
    operationId,
    mapper: config.mapper,
    onProgress,
    onExpired,
    onComplete,
    onError,
    onLostConnection,
  });

  const runScan = async () => {
    setProgress({ scanning: true, progress: 0, status: `Starting ${resultsLabel} scan...`, operationId: null });
    setResults([]);
    try {
      const res = await fetch(`${PY_API}/api/scanner/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: scanDate || null,
          filters: config.scanFilters(values, directionValue),
        }),
      });
      const d = (await res.json()) as { status?: string; message?: string; operation_id?: string };
      if (d.status !== "started") throw new Error(d.message || "Failed to start");
      setProgress({ scanning: true, progress: 0, status: "Scan started...", operationId: d.operation_id ?? null });
    } catch (e) {
      const err = e as Error;
      setProgress({ scanning: false, progress: 0, status: `Failed to start scan: ${err.message}`, operationId: null });
    }
  };

  const copyClipboard = () => {
    const syms = results.map((r) => r.symbol);
    navigator.clipboard.writeText(syms.map((s) => `NSE:${s}-EQ`).join(","));
    showToast(`Copied ${syms.length} symbols`, "success");
  };

  const exportCsv = () => {
    if (!results.length) return;
    const rows = results.map(config.csvRow);
    const blob = new Blob([[config.csvHeader, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mode}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tableColumns = config.columns.map((c) => ({ key: c.k, label: c.l }));

  return (
    <Box sx={{ minHeight: "100vh" }}>
      {toasts.map((t) => (
        <Box
          key={t.id}
          sx={{ position: "fixed", bottom: 24 + t.position * 60, [viewMode === "chart" ? "left" : "right"]: 24, zIndex: 9999 }}
        >
          <ToastNotification
            message={t.message}
            type={t.type}
            onClose={() => removeToast(t.id)}
            slideFrom={viewMode === "chart" ? "left" : "right"}
          />
        </Box>
      ))}

      <Card sx={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 2 }}>
        <CardContent sx={{ px: 3, py: 2 }}>
          <FilterBar
            filters={config.filters.map((f) => ({
              label: f.label,
              value: values[f.key],
              onChange: (v: number) => setValue(f.key, v),
              min: f.min,
              max: f.max,
            }))}
            direction={config.direction
              ? { value: directionValue, onChange: setDirectionValue, options: config.direction.options }
              : undefined}
            scanDate={scanDate}
            onScanDateChange={setScanDate}
            scanning={scanning}
            onRun={runScan}
            primary={palette.primary}
            primaryHover={palette.primaryHover}
            buttonText={palette.buttonText}
          />
        </CardContent>
      </Card>

      {scanning && (
        <Box sx={{ mt: 1.5, px: 0.5 }}>
          <CandleProgress progress={progress} />
          <Typography sx={{ color: "#cbd5e1", fontSize: "0.8rem", mt: 1 }}>
            {status}
          </Typography>
        </Box>
      )}

      {results.length > 0 && (
        <Card sx={{ ...cardSx, border: "1px solid rgba(255,255,255,0.06)", borderLeft: `3px solid ${palette.accent}` }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                {config.icon}
                <Typography sx={{ fontWeight: 600, color: "#f8fafc", fontSize: "0.95rem" }}>
                  Scan Results ({results.length} stocks)
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                <Box sx={{ display: "flex", bgcolor: "#1e293b", borderRadius: 1.5, p: 0.3, mr: 1 }}>
                  <Tooltip title="Table View">
                    <IconButton
                      size="small"
                      onClick={() => setViewMode("table")}
                      sx={{
                        color: viewMode === "table" ? palette.primary : "#475569",
                        bgcolor: viewMode === "table" ? palette.primaryBg : "transparent",
                        borderRadius: 1,
                        p: 0.5,
                        "&:hover": { bgcolor: palette.primaryHoverBg },
                      }}
                    >
                      <TableIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Chart View">
                    <IconButton
                      size="small"
                      onClick={() => setViewMode("chart")}
                      sx={{
                        color: viewMode === "chart" ? palette.accent : "#475569",
                        bgcolor: viewMode === "chart" ? palette.accentBg : "transparent",
                        borderRadius: 1,
                        p: 0.5,
                        "&:hover": { bgcolor: palette.accentHoverBg },
                      }}
                    >
                      <ChartIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Tooltip title="Copy to Clipboard (Fyers format)">
                  <IconButton onClick={copyClipboard} sx={{ color: "#475569", "&:hover": { color: "#06b6d4" } }}>
                    <CopyIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Export to CSV">
                  <IconButton onClick={exportCsv} sx={{ color: "#475569", "&:hover": { color: "#10b981" } }}>
                    <DownloadIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Box sx={{ height: 2, bgcolor: palette.accentTint }} />

            {viewMode === "table" ? (
              <ScannerTable<R>
                columns={tableColumns}
                rows={results}
                rowKey={(row) => row.symbol}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                sortActiveColor={palette.primary}
                toggleAccentColor={palette.accent}
                savedSymbols={savedSymbols}
                onToggleRow={toggleRow}
                toggleTooltipLabel={resultsLabel}
                renderCells={config.renderCells}
              />
            ) : (
              <Box sx={{ p: 2 }}>
                <ScannerSplitPane
                  stocks={results}
                  mode={mode}
                  savedSymbols={savedSymbols}
                  onToggle={toggleRow}
                  chartCacheRef={chartCacheRef}
                />
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
