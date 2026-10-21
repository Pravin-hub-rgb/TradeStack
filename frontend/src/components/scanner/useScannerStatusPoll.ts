/**
 * Shared scanner status polling (1s interval) for Continuation and Reversal
 * scanners — replaces the two duplicated setInterval blocks.
 *
 * Flow mirrors the original: poll /api/scanner/status/{id} until the payload
 * carries `detail` (server restarted) or status becomes completed / error.
 * Liveness/progress is reported through callbacks; the hook only owns the
 * interval lifecycle and result mapping.
 */
"use client";

import { useEffect } from "react";
import { PY_API } from "@/lib/api";
import type { ScanResult, ReversalResult, ScanRowPayload, ScanStatusPayload } from "@/lib/types";

export type ScannerRowUnion = ScanResult | ReversalResult;

export interface ScannerPollParams<R extends ScannerRowUnion> {
  scanning: boolean;
  operationId: string | null;
  mapper: (raw: ScanRowPayload) => R;
  onProgress: (progress: number, status: string) => void;
  onExpired: () => void;
  onComplete: (rows: R[]) => void;
  onError: (message: string) => void;
  onLostConnection: () => void;
}

const POLL_INTERVAL_MS = 1000;

export function useScannerStatusPoll<R extends ScannerRowUnion>({
  scanning,
  operationId,
  mapper,
  onProgress,
  onExpired,
  onComplete,
  onError,
  onLostConnection,
}: ScannerPollParams<R>) {
  useEffect(() => {
    if (!scanning || !operationId) return;
    const intervalId = setInterval(async () => {
      try {
        const r = await fetch(`${PY_API}/api/scanner/status/${operationId}`);
        const d = (await r.json()) as ScanStatusPayload;

        if (d.detail) {
          clearInterval(intervalId);
          onExpired();
          return;
        }

        onProgress(d.progress || 0, d.message || "Processing...");

        if (d.status === "completed") {
          clearInterval(intervalId);
          const rawRows: ScanRowPayload[] = d.result?.results || [];
          onComplete(rawRows.map(mapper));
        } else if (d.status === "error") {
          clearInterval(intervalId);
          onError(d.message || "Scan failed");
        }
      } catch {
        clearInterval(intervalId);
        onLostConnection();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [scanning, operationId, mapper, onProgress, onExpired, onComplete, onError, onLostConnection]);
}
