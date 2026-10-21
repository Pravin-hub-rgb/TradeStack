/**
 * Unified error-to-message extraction for every catch site in the app.
 *
 * Covers: Error instances, the `{"detail": ...}` / `{"error": ...}` JSON bodies
 * the backend and API routes return, plain strings, and anything else.
 */

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err) return err;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const candidate = e.detail ?? e.error ?? e.message;
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return String(err);
}
