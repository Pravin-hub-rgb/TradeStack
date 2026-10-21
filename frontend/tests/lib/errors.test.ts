import { describe, expect, it } from "vitest";

import { errorMessage } from "../../src/lib/errors";

describe("errorMessage", () => {
  it("uses Error.message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it('extracts FastAPI {"detail": ...} bodies', () => {
    expect(errorMessage({ detail: "Internal server error: ValueError" })).toBe(
      "Internal server error: ValueError",
    );
  });

  it('extracts Next-route {"error": ...} bodies', () => {
    expect(errorMessage({ error: "Unknown action" })).toBe("Unknown action");
  });

  it('extracts {"message": ...} bodies', () => {
    expect(errorMessage({ message: "token expired" })).toBe("token expired");
  });

  it("prefers detail over error when both exist", () => {
    expect(errorMessage({ detail: "A", error: "B" })).toBe("A");
  });

  it("accepts plain strings", () => {
    expect(errorMessage("plain text")).toBe("plain text");
  });

  it("falls back to String() for unknown shapes", () => {
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
    expect(errorMessage({ detail: 42 })).toBe("[object Object]");
    expect(errorMessage({})).toBe("[object Object]");
  });
});
