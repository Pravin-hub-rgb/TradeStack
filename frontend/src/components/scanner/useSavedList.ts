/**
 * Shared saved-stock-list state for the 2 scanners:
 * loads saved symbols for a list type and toggles membership via the API.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { PY_API } from "@/lib/api";
import type { StockListResponse } from "@/lib/types";
import type { ToastType } from "@/lib/hooks/useToastStack";

export function useSavedList(
  listType: "continuation" | "reversal",
  showToast: (message: string, type: ToastType) => void,
) {
  const [savedSymbols, setSavedSymbols] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${PY_API}/api/stock-list/${listType}`)
      .then((r) => r.json())
      .then((d: StockListResponse) => setSavedSymbols((d.stocks || []).map((s) => s.symbol)))
      .catch(() => {});
  }, [listType]);

  const toggleInList = useCallback(
    async (symbol: string, payload?: Record<string, unknown>) => {
      const isIn = savedSymbols.includes(symbol);
      try {
        if (isIn) {
          await fetch(`${PY_API}/api/stock-list/${listType}/${symbol}`, { method: "DELETE" });
          setSavedSymbols((prev) => prev.filter((s) => s !== symbol));
          showToast(`Removed ${symbol} from list`, "success");
        } else {
          await fetch(`${PY_API}/api/stock-list/${listType}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, ...(payload ?? {}) }),
          });
          setSavedSymbols((prev) => [...prev, symbol]);
          showToast(`Added ${symbol} to list`, "success");
        }
      } catch {
        showToast(`Failed to update ${symbol}`, "error");
      }
    },
    [listType, savedSymbols, showToast],
  );

  return { savedSymbols, toggleInList };
}
