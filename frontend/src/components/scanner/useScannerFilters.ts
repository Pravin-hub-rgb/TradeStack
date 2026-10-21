/**
 * Shared scanner filter state: generic number-filter dictionary + optional
 * direction select + scan date, with localStorage persistence, backend
 * settings sync and hydration — replaces the duplicated per-field useState +
 * useEffect + settings-fetch blocks in both scanners.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { PY_API } from "@/lib/api";
import { saveSetting } from "@/lib/settingsSync";
import type { SettingsListResponse } from "@/lib/types";

export interface ScannerFilterDef {
  /** State key, e.g. "minPrice". */
  key: string;
  label: string;
  def: number;
  min: number;
  max: number;
  /** Parse used when hydrating from backend settings. */
  parse: "int" | "float";
  /** localStorage key (without scanner prefix). */
  lsKey: string;
  /** Optional backend setting synced on change. */
  saveSettingKey?: string;
  /** Optional backend setting hydrated once on mount. */
  settingsKey?: string;
}

export interface ScannerDirectionDef {
  /** localStorage key (without scanner prefix). */
  lsKey: string;
  /** Backend setting hydrated once on mount. */
  settingsKey?: string;
  def: string;
  options: string[];
}

const parseFilter = (v: string, parse: "int" | "float"): number =>
  parse === "int" ? parseInt(v, 10) : parseFloat(v);

const readLocalNumber = (fullKey: string, def: number): number => {
  if (typeof window === "undefined") return def;
  const v = localStorage.getItem(fullKey);
  // Preserves the original scanners' parseInt() quirk for local values
  return v ? parseInt(v, 10) : def;
};

export function useScannerFilters(
  prefix: string,
  filters: ScannerFilterDef[],
  direction?: ScannerDirectionDef,
) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const f of filters) init[f.key] = readLocalNumber(`${prefix}_${f.lsKey}`, f.def);
    return init;
  });

  const [directionValue, setDirectionValueRaw] = useState<string>(() => {
    if (!direction) return "";
    const fallback = direction.def;
    if (typeof window === "undefined") return fallback;
    return localStorage.getItem(`${prefix}_${direction.lsKey}`) || fallback;
  });

  const [scanDate, setScanDateRaw] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`${prefix}_scanDate`) || "";
  });

  /** Change one filter value and persist it (localStorage + optional sync). */
  const setValue = useCallback(
    (key: string, val: number) => {
      setValues((prev) => ({ ...prev, [key]: val }));
      const f = filters.find((x) => x.key === key);
      if (!f) return;
      localStorage.setItem(`${prefix}_${f.lsKey}`, String(val));
      if (f.saveSettingKey) saveSetting(f.saveSettingKey, String(val));
    },
    [prefix, filters],
  );

  const setDirectionValue = useCallback(
    (v: string) => {
      if (!direction) return;
      setDirectionValueRaw(v);
      localStorage.setItem(`${prefix}_${direction.lsKey}`, v);
    },
    [prefix, direction],
  );

  const setScanDate = useCallback(
    (v: string) => {
      setScanDateRaw(v);
      localStorage.setItem(`${prefix}_scanDate`, v);
    },
    [prefix],
  );

  // Mount: persist the starting values once (matches the old per-field mount
  // effects, which also seeded localStorage + settings on first render)
  useEffect(() => {
    for (const f of filters) {
      localStorage.setItem(`${prefix}_${f.lsKey}`, String(values[f.key]));
      if (f.saveSettingKey) saveSetting(f.saveSettingKey, String(values[f.key]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mount: hydrate values from backend settings
  useEffect(() => {
    fetch(`${PY_API}/api/settings`)
      .then((r) => r.json())
      .then((data: SettingsListResponse) => {
        const s: Record<string, string> = {};
        for (const item of data.settings || []) {
          if (item.key) s[item.key] = item.value;
        }
        for (const f of filters) {
          const raw = f.settingsKey ? s[f.settingsKey] : undefined;
          if (raw) setValues((prev) => ({ ...prev, [f.key]: parseFilter(raw, f.parse) }));
        }
        if (direction?.settingsKey && s[direction.settingsKey]) {
          setDirectionValueRaw(s[direction.settingsKey]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { values, setValue, directionValue, setDirectionValue, scanDate, setScanDate };
}
