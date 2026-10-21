/**
 * Central Python API client.
 *
 * Every browser-side call to the FastAPI data microservice must go through this
 * module. The base URL is configurable so the same frontend build can talk to a
 * local backend, a container, or a remote host:
 *
 *   NEXT_PUBLIC_PY_API=http://localhost:8001
 *
 * In Docker the frontend container reaches the backend by service name, so the
 * value is baked in at build time via `docker-compose.yml`.
 */

export const PY_API: string =
  process.env.NEXT_PUBLIC_PY_API ?? "http://127.0.0.1:8001";

import { errorMessage } from "@/lib/errors";

/**
 * Server-side base URL.
 *
 * In Docker the browser reaches the backend on the host (`localhost:8001`) but
 * the Next.js server reaches it by service name (`http://backend:8001`). Set
 * `PY_API_INTERNAL` to override just the server-side value.
 */
export const PY_API_INTERNAL: string =
  process.env.PY_API_INTERNAL ?? process.env.NEXT_PUBLIC_PY_API ?? "http://127.0.0.1:8001";

/** Base URL for server-side (Node) calls. */
export const SERVER_PY_API: string = PY_API_INTERNAL;

/** Default request timeout (ms). Long-running ops are polled, never awaited inline. */
export const API_TIMEOUT_MS = 30_000;

/** Error thrown by the API helpers — carries the HTTP status and the parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(message: string, status: number, url: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export interface RequestOptions {
  /** Override the default timeout for this call. */
  timeoutMs?: number;
  /** Abort the request after N ms regardless of server state. */
  signal?: AbortSignal;
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${PY_API}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Extract a human-readable message from a FastAPI error body. */
function extractDetail(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (typeof rec.detail === "string") return rec.detail;
    if (rec.detail) return JSON.stringify(rec.detail);
    if (typeof rec.message === "string") return rec.message;
    if (typeof rec.error === "string") return rec.error;
  }
  return "";
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path);
  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Chain an externally supplied signal onto our timeout controller.
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const parsed = await readBody(res);

    if (!res.ok) {
      const detail = extractDetail(parsed);
      throw new ApiError(
        `${method} ${path} failed with ${res.status}${detail ? `: ${detail}` : ""}`,
        res.status,
        url,
        parsed,
      );
    }

    return parsed as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(`${method} ${path} timed out after ${timeoutMs}ms`, 408, url, null);
    }
    const message = errorMessage(err);
    throw new ApiError(`${method} ${path} failed: ${message}`, 0, url, null);
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet = <T>(path: string, options?: RequestOptions): Promise<T> =>
  request<T>("GET", path, undefined, options);

export const apiPost = <T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> => request<T>("POST", path, body, options);


/* ------------------------------------------------------------------ */
/* Endpoint groups — one place to see every backend route the UI uses. */
/* ------------------------------------------------------------------ */

export const dataApi = {
  cacheInfo: () => apiGet("/api/data/cache-info"),
  cacheDates: () => apiGet("/api/data/cache-dates"),
  cacheFreshness: () => apiGet("/api/data/cache-freshness"),
  symbols: () => apiGet("/api/data/symbols"),
  updateBhavcopy: (body?: unknown) => apiPost("/api/data/update-bhavcopy", body),
  fillGaps: (body?: unknown) => apiPost("/api/data/fill-gaps", body),
  downloadHistorical: (body?: unknown) =>
    apiPost("/api/data/download-historical", body, { timeoutMs: 60_000 }),
  batchStockHistory: (body: unknown) => apiPost("/api/data/batch-stock-history", body),
  scanNewStocks: () => apiGet("/api/data/scan-new-stocks", { timeoutMs: 60_000 }),
  syncNewStocks: (symbols: string[]) =>
    apiPost("/api/data/sync-new-stocks", { symbols }),
  status: (operationId: string) => apiGet(`/api/data/status/${operationId}`),
};

export const tokenApi = {
  status: () => apiGet("/api/token/status"),
  check: () => apiGet("/api/token/check"),
  raw: () => apiGet("/api/token/raw"),
  validate: (token: string) => apiPost("/api/token/validate", { token }),
};

export const scannerApi = {
  continuation: (body: unknown) => apiPost("/api/scanner/continuation", body),
  reversal: (body: unknown) => apiPost("/api/scanner/reversal", body),
  status: (operationId: string) => apiGet(`/api/scanner/status/${operationId}`),
};

export const settingsApi = {
  all: () => apiGet("/api/settings"),
  get: (key: string) => apiGet(`/api/settings/${key}`),
  set: (key: string, value: string) => apiPut(`/api/settings/${key}`, { value }),
  reset: (category?: string) =>
    apiPost(category ? `/api/settings/reset/${category}` : "/api/settings/reset"),
};

export const stockListApi = {
  list: (listType: string) => apiGet(`/api/stock-list/${listType}`),
  resolved: (listType: string) => apiGet(`/api/stock-list/${listType}/resolved`),
  check: (listType: string, symbol: string) =>
    apiGet(`/api/stock-list/${listType}/check/${symbol}`),
  add: (listType: string, body: unknown) => apiPost(`/api/stock-list/${listType}`, body),
  remove: (listType: string, symbol: string) =>
    apiDelete(`/api/stock-list/${listType}/${symbol}`),
  clear: (listType: string) => apiDelete(`/api/stock-list/${listType}`),
};

export const breadthApi = {
  data: () => apiGet("/api/breadth/data"),
  bias: () => apiGet("/api/breadth/bias"),
  update: (body?: unknown) => apiPost("/api/breadth/update", body),
};

export const prepApi = {
  iep: (body: unknown) => apiPost("/api/prep/iep", body),
  volumeProfile: (body: unknown) => apiPost("/api/prep/volume-profile", body),
  volumeBaselines: (body: unknown) => apiPost("/api/prep/volume-baselines", body),
  currentVolume: (body: unknown) => apiPost("/api/prep/current-volume", body),
  previousTradingDay: () => apiGet("/api/prep/previous-trading-day"),
};

export const tradesApi = {
  logEntry: (body: unknown) => apiPost("/api/trades/log-entry", body),
  list: () => apiGet("/api/trades/list"),
  dailyPnl: () => apiGet("/api/trades/daily-pnl"),
  yearlyPnl: () => apiGet("/api/trades/yearly-pnl"),
  stats: () => apiGet("/api/trades/stats"),
  capitalStats: () => apiGet("/api/trades/capital-stats"),
  update: (tradeId: string, body: unknown) => apiPut(`/api/trades/${tradeId}`, body),
  remove: (tradeId: string) => apiDelete(`/api/trades/${tradeId}`),
};

export const instrumentApi = {
  resolve: (symbols: string[]) => apiPost("/api/instrument-keys", { symbols }),
};

export const healthApi = {
  check: () => apiGet<{ status: string }>("/health", { timeoutMs: 5_000 }),
};

export const apiPut = <T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> => request<T>("PUT", path, body, options);

export const apiDelete = <T>(
  path: string,
  options?: RequestOptions,
): Promise<T> => request<T>("DELETE", path, undefined, options);
