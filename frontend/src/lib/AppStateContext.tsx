"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface ScanResult {
  symbol: string; close: number; sma20?: number; dist_to_ma_pct?: number;
  phase1_high?: number; phase2_low?: number; depth_pct?: number; adr_pct: number;
}

interface ReversalResult {
  symbol: string; close: number; period: number; green_days: number;
  first_red_date: string; decline_percent: number;
  trend_context: string; adr_pct: number;
}

export interface ScanProgress {
  scanning: boolean;
  progress: number;
  status: string;
  operationId: string | null;
}

interface AppState {
  activeScannerTab: string;
  activeLiveTradingTab: string;
  continuationResults: ScanResult[];
  reversalResults: ReversalResult[];
  contScanProgress: ScanProgress;
  revScanProgress: ScanProgress;
  continuationViewMode: "table" | "chart";
  reversalViewMode: "table" | "chart";
  validationResult: string;
  isValidating: boolean;
  validationStatus: "idle" | "success" | "error";
}

const NAV_KEY = "tradestack-navigation";
const RESULT_KEY = "tradestack-scan-results";
const REV_RESULT_KEY = "tradestack-rev-results";
const CONT_PROGRESS_KEY = "tradestack-cont-progress";
const REV_PROGRESS_KEY = "tradestack-rev-progress";
const CONT_VIEW_KEY = "tradestack-cont-view";
const REV_VIEW_KEY = "tradestack-rev-view";
const VALIDATION_KEY = "tradestack-validation";

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const defaultScanProgress: ScanProgress = { scanning: false, progress: 0, status: "", operationId: null };

interface AppStateContextValue {
  state: AppState;
  setActiveScannerTab: (tab: string) => void;
  setActiveLiveTradingTab: (tab: string) => void;
  setContinuationResults: (results: ScanResult[]) => void;
  setReversalResults: (results: ReversalResult[]) => void;
  setContScanProgress: (p: ScanProgress) => void;
  setRevScanProgress: (p: ScanProgress) => void;
  setContinuationViewMode: (m: "table" | "chart") => void;
  setReversalViewMode: (m: "table" | "chart") => void;
  setValidationResult: (r: string) => void;
  setIsValidating: (v: boolean) => void;
  setValidationStatus: (s: "idle" | "success" | "error") => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    activeScannerTab: "cache",
    activeLiveTradingTab: "token",
    continuationResults: [],
    reversalResults: [],
    contScanProgress: { ...defaultScanProgress },
    revScanProgress: { ...defaultScanProgress },
    continuationViewMode: "table",
    reversalViewMode: "table",
    validationResult: "",
    isValidating: false,
    validationStatus: "idle",
  });

  useEffect(() => {
    const nav = loadFromStorage<{ activeScannerTab?: string; activeLiveTradingTab?: string }>(NAV_KEY, {});
    const cr = loadFromStorage<ScanResult[]>(RESULT_KEY, []);
    const rr = loadFromStorage<ReversalResult[]>(REV_RESULT_KEY, []);
    const cp = loadFromStorage<ScanProgress>(CONT_PROGRESS_KEY, { ...defaultScanProgress });
    const rp = loadFromStorage<ScanProgress>(REV_PROGRESS_KEY, { ...defaultScanProgress });
    const cv = loadFromStorage<"table" | "chart">(CONT_VIEW_KEY, "table");
    const rv = loadFromStorage<"table" | "chart">(REV_VIEW_KEY, "table");
    const vl = loadFromStorage<{ validationResult: string; isValidating: boolean; validationStatus: "idle" | "success" | "error" }>(VALIDATION_KEY, { validationResult: "", isValidating: false, validationStatus: "idle" });
    setState({
      activeScannerTab: nav.activeScannerTab || "cache",
      activeLiveTradingTab: nav.activeLiveTradingTab || "token",
      continuationResults: cr,
      reversalResults: rr,
      contScanProgress: cp.scanning ? cp : { ...defaultScanProgress },
      revScanProgress: rp.scanning ? rp : { ...defaultScanProgress },
      continuationViewMode: cv,
      reversalViewMode: rv,
      validationResult: vl.validationResult,
      isValidating: vl.isValidating,
      validationStatus: vl.validationStatus,
    });
  }, []);

  useEffect(() => {
    saveToStorage(NAV_KEY, {
      activeScannerTab: state.activeScannerTab,
      activeLiveTradingTab: state.activeLiveTradingTab,
    });
  }, [state.activeScannerTab, state.activeLiveTradingTab]);

  useEffect(() => {
    saveToStorage(RESULT_KEY, state.continuationResults);
  }, [state.continuationResults]);

  useEffect(() => {
    saveToStorage(REV_RESULT_KEY, state.reversalResults);
  }, [state.reversalResults]);

  useEffect(() => {
    saveToStorage(CONT_PROGRESS_KEY, state.contScanProgress);
  }, [state.contScanProgress]);

  useEffect(() => {
    saveToStorage(REV_PROGRESS_KEY, state.revScanProgress);
  }, [state.revScanProgress]);

  useEffect(() => {
    saveToStorage(CONT_VIEW_KEY, state.continuationViewMode);
  }, [state.continuationViewMode]);

  useEffect(() => {
    saveToStorage(REV_VIEW_KEY, state.reversalViewMode);
  }, [state.reversalViewMode]);

  useEffect(() => {
    saveToStorage(VALIDATION_KEY, { validationResult: state.validationResult, isValidating: state.isValidating, validationStatus: state.validationStatus });
  }, [state.validationResult, state.isValidating, state.validationStatus]);

  const setActiveScannerTab = useCallback((tab: string) => {
    setState(prev => ({ ...prev, activeScannerTab: tab }));
  }, []);

  const setActiveLiveTradingTab = useCallback((tab: string) => {
    setState(prev => ({ ...prev, activeLiveTradingTab: tab }));
  }, []);

  const setContinuationResults = useCallback((results: ScanResult[]) => {
    setState(prev => ({ ...prev, continuationResults: results }));
  }, []);

  const setReversalResults = useCallback((results: ReversalResult[]) => {
    setState(prev => ({ ...prev, reversalResults: results }));
  }, []);

  const setContScanProgress = useCallback((p: ScanProgress) => {
    setState(prev => ({ ...prev, contScanProgress: p }));
  }, []);

  const setRevScanProgress = useCallback((p: ScanProgress) => {
    setState(prev => ({ ...prev, revScanProgress: p }));
  }, []);

  const setContinuationViewMode = useCallback((m: "table" | "chart") => {
    setState(prev => ({ ...prev, continuationViewMode: m }));
  }, []);

  const setReversalViewMode = useCallback((m: "table" | "chart") => {
    setState(prev => ({ ...prev, reversalViewMode: m }));
  }, []);

  const setValidationResult = useCallback((r: string) => {
    setState(prev => ({ ...prev, validationResult: r }));
  }, []);

  const setIsValidating = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, isValidating: v }));
  }, []);

  const setValidationStatus = useCallback((s: "idle" | "success" | "error") => {
    setState(prev => ({ ...prev, validationStatus: s }));
  }, []);

  return (
    <AppStateContext.Provider value={{ state, setActiveScannerTab, setActiveLiveTradingTab, setContinuationResults, setReversalResults, setContScanProgress, setRevScanProgress, setContinuationViewMode, setReversalViewMode, setValidationResult, setIsValidating, setValidationStatus }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
