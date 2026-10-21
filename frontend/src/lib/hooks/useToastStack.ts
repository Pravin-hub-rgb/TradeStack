/**
 * Shared toast stack — replaces the 5 duplicated local implementations
 * (2 scanners, StockList, LiveTrading, CacheData).
 *
 * Default behaviour matches the simple variant: newest toast appended with
 * position = stack length, auto-dismiss after 4s.
 * Options:
 *  - durationMs: use Infinity to disable auto-dismiss (CacheData keeps toasts
 *    until closed manually)
 *  - pickPosition: custom position strategy (CacheData reuses freed slots)
 *  - defaultType: implicit toast type (CacheData defaults to "success")
 */
"use client";

import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "warning";

export interface StackToast {
  id: string;
  message: string;
  type: ToastType;
  position: number;
}

export interface ToastStackOptions {
  durationMs?: number;
  pickPosition?: (prev: StackToast[]) => number;
  defaultType?: ToastType;
}

export function useToastStack(options: ToastStackOptions = {}) {
  const { durationMs = 4000, pickPosition, defaultType } = options;

  const [toasts, setToasts] = useState<StackToast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type?: ToastType) => {
      const resolvedType = type ?? defaultType;
      if (!resolvedType) return;
      const id = `t-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [
        ...prev,
        { id, message, type: resolvedType, position: pickPosition ? pickPosition(prev) : prev.length },
      ]);
      if (durationMs !== Infinity) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, durationMs);
      }
    },
    [pickPosition, defaultType, durationMs],
  );

  return { toasts, showToast, removeToast };
}
