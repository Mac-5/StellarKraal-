type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const isDev = process.env.NODE_ENV !== "production";

function emit(entry: LogEntry): void {
  if (isDev) {
    const method = entry.level === "debug" ? "log" : entry.level;
    // eslint-disable-next-line no-console
    console[method](`[${entry.level}] ${entry.message}`, entry.context ?? "");
  }
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  emit({ level, message, context, timestamp: new Date().toISOString() });
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
};

/**
 * Report an error caught by a React error boundary to the frontend logging sink.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error(message, { ...context, stack });
}

export default logger;
