/**
 * Shared UI payload types — the single source of truth for data crossing the
 * Next.js ⇄ FastAPI boundary. Backend Python sends snake_case keys; keep them
 * verbatim so mapping is explicit and greppable.
 */

/* ---------------------------- Scanners ---------------------------- */

/** Continuation scan row as consumed by UI tables/charts (always clean types). */
export interface ScanResult {
  symbol: string;
  close: number;
  sma20?: number;
  dist_to_ma_pct?: number;
  phase1_high?: number;
  phase2_low?: number;
  depth_pct?: number;
  adr_pct: number;
}

/** Reversal scan row as consumed by UI tables/charts (always clean types). */
export interface ReversalResult {
  symbol: string;
  close: number;
  period: number;
  green_days: number;
  first_red_date: string;
  decline_percent: number;
  trend_context: string;
  adr_pct: number;
}

/**
 * Scanner row exactly as Python serializes it — fields may be missing or null.
 * Map to ScanResult/ReversalResult (with ?? defaults) before storing in app state.
 */
export interface ScanRowPayload {
  symbol?: string;
  close?: number | null;
  sma20?: number | null;
  dist_to_ma_pct?: number | null;
  phase1_high?: number | null;
  phase2_low?: number | null;
  depth_pct?: number | null;
  adr_pct?: number | null;
  period?: number | null;
  green_days?: number | null;
  first_red_date?: string | null;
  decline_percent?: number | null;
  trend_context?: string | null;
}

/** Poll payload from /api/scanner/status/{id}. */
export interface ScanStatusPayload {
  status?: string;
  progress?: number;
  message?: string;
  detail?: unknown;
  operation_id?: string;
  result?: { results?: ScanRowPayload[] } | null;
}

/* -------------------------- Stock lists --------------------------- */

/** Row of /api/stock-list/{type}. */
export interface StockListItem {
  id: number;
  list_type: string;
  symbol: string;
  close: number | null;
  trend_context: string | null;
  period: number | null;
  depth_pct: number | null;
  added_at: string;
}

export interface StockListResponse {
  stocks?: StockListItem[];
}

/* ----------------------------- Charts ----------------------------- */

/** Candle payload of /api/data/batch-stock-history (keyed record). */
export interface CandleData {
  candles: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
  sma: { date: string; value: number }[];
}

/* ------------------------- Cache operations ------------------------ */

export interface CacheInfo {
  stock_count: number;
  total_size_mb: number;
  latest_date: string | null;
}

/** Result object of a finished background data operation. */
export interface OperationStatusResult {
  dates_filled?: number;
  total_updated?: number;
  updated?: number;
  date?: string | null;
  [key: string]: unknown;
}

/** Poll payload of /api/data/status/{id}. */
export interface OperationStatus {
  type: string;
  status: "running" | "completed" | "error";
  progress: number;
  message: string;
  error?: string;
  result?: OperationStatusResult;
  logs?: string[];
}

/* ---------------------------- Settings ----------------------------- */

export interface SettingsListResponse {
  settings?: { key: string; value: string }[];
}
