export const PY_API = "http://127.0.0.1:8001";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function secondsUntilIST(targetIST: string): number {
  const p = targetIST.split(":").map(Number);
  let utcH = p[0] - 5, utcM = p[1] - 30;
  if (utcM < 0) { utcH -= 1; utcM += 60; }
  if (utcH < 0) utcH += 24;
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(utcH, utcM, p[2] || 0, 0);
  return Math.max(0, (target.getTime() - now.getTime()) / 1000);
}

export async function sleepUntilIST(targetIST: string): Promise<void> {
  const secs = secondsUntilIST(targetIST);
  if (secs > 0) {
    console.log(`[PREP] Waiting ${secs.toFixed(0)}s until ${targetIST} IST...`);
    await sleep(secs * 1000);
  }
}

export async function fetchFromPython<T>(endpoint: string, body?: unknown): Promise<T> {
  const url = `${PY_API}${endpoint}`;
  const opts: RequestInit = {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Python API ${endpoint} returned ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}
