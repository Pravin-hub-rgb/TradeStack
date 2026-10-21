import { PY_API } from "@/lib/api";

const _timers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * Debounced save a setting value to the backend DB.
 * Uses PUT /api/settings/{key} — same endpoint the Settings page uses.
 * Fires once ~600ms after the last call for each key.
 */
export function saveSetting(key: string, value: string): void {
  if (_timers[key]) clearTimeout(_timers[key]);
  _timers[key] = setTimeout(() => {
    fetch(`${PY_API}/api/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    }).catch(() => {});
  }, 600);
}
