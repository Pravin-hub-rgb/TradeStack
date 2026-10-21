/**
 * Structured frontend logger with severity levels and pluggable sinks.
 *
 * Every log call goes to the console (level-appropriate method) and to all
 * registered sinks. Sinks are isolated — a throwing sink never breaks logging.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/** One structured log record — what sinks and the live terminal consume. */
export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: string;
  message: string;
}

/** A log line as transported over SSE / GET /api/live. */
export interface LogLine {
  timestamp: string;
  message: string;
  level: LogLevel;
}

export type LogSink = (entry: LogEntry) => void;

const CONSOLE_METHOD: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
};

class Logger {
  private sinks = new Set<LogSink>();

  /** Register a sink; returns an unsubscribe function. */
  addSink(sink: LogSink): () => void {
    this.sinks.add(sink);
    return () => this.removeSink(sink);
  }

  removeSink(sink: LogSink): void {
    this.sinks.delete(sink);
  }

  debug(source: string, message: string, err?: unknown): void {
    this.emit("DEBUG", source, message, err);
  }

  info(source: string, message: string, err?: unknown): void {
    this.emit("INFO", source, message, err);
  }

  warn(source: string, message: string, err?: unknown): void {
    this.emit("WARN", source, message, err);
  }

  error(source: string, message: string, err?: unknown): void {
    this.emit("ERROR", source, message, err);
  }

  private emit(level: LogLevel, source: string, message: string, err?: unknown): void {
    const entry: LogEntry = { ts: new Date().toISOString(), level, source, message };
    const suffix = err instanceof Error ? ` — ${err.message}` : "";
    console[CONSOLE_METHOD[level]](`[${entry.level}] [${source}] ${message}${suffix}`, err instanceof Error ? err : "");
    for (const sink of this.sinks) {
      try {
        sink(entry);
      } catch {
        /* a broken sink must never break logging */
      }
    }
  }
}

export const logger = new Logger();
