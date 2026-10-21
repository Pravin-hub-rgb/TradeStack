import { afterEach, describe, expect, it, vi } from "vitest";

import { logger, type LogEntry, type LogLevel } from "../../src/lib/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("delivers structured entries to registered sinks", () => {
    const entries: LogEntry[] = [];
    const unsubscribe = logger.addSink((e) => entries.push(e));

    logger.info("TestSrc", "hello world");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("INFO");
    expect(entries[0].source).toBe("TestSrc");
    expect(entries[0].message).toBe("hello world");
    expect(entries[0].ts).toBeTruthy();
    unsubscribe();
  });

  it("unsubscribe stops delivery", () => {
    const entries: LogEntry[] = [];
    const unsubscribe = logger.addSink((e) => entries.push(e));
    unsubscribe();

    logger.info("TestSrc", "after unsubscribe");

    expect(entries).toHaveLength(0);
  });

  it("each level uses the matching console method", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const unsubscribe = logger.addSink(() => {});

    logger.debug("S", "d");
    logger.info("S", "i");
    logger.warn("S", "w");
    logger.error("S", "e");

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("[ERROR] [S] e");
    unsubscribe();
  });

  it("appends Error message and passes err object to console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const unsubscribe = logger.addSink(() => {});
    const boom = new Error("disk full");

    logger.error("S", "operation failed", boom);

    expect(String(errorSpy.mock.calls[0][0])).toContain("operation failed — disk full");
    expect(errorSpy.mock.calls[0][1]).toBe(boom);
    unsubscribe();
  });

  it("a throwing sink never breaks logging or other sinks", () => {
    const good: LogEntry[] = [];
    const unsubscribe = logger.addSink(() => { throw new Error("sink exploded"); });
    const unsubscribe2 = logger.addSink((e) => good.push(e));

    expect(() => logger.warn("S", "still works")).not.toThrow();
    expect(good).toHaveLength(1);
    expect(good[0].level satisfies LogLevel).toBe("WARN");
    unsubscribe();
    unsubscribe2();
  });
});
