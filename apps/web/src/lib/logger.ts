/**
 * Premium admin-panel logger — structured, leveled, workspace-aware.
 * Wraps console + optional pino, never throws, safe for edge/runtime.
 * All admin actions should log via this module for consistent observability.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  workspaceId?: number | string | null;
  userId?: number | string | null;
  action?: string;
  entityType?: string;
  entityId?: number | string | null;
  route?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  error?: unknown;
}

function formatContext(ctx: LogContext): string {
  const parts: string[] = [];
  if (ctx.workspaceId) parts.push(`ws=${ctx.workspaceId}`);
  if (ctx.userId) parts.push(`user=${ctx.userId}`);
  if (ctx.action) parts.push(`action=${ctx.action}`);
  if (ctx.entityType) parts.push(`${ctx.entityType}#${ctx.entityId ?? ""}`);
  if (ctx.route) parts.push(`route=${ctx.route}`);
  if (ctx.durationMs !== undefined) parts.push(`${ctx.durationMs}ms`);
  return parts.length ? ` [${parts.join(" ")}]` : "";
}

function serializeError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}${err.stack ? `\n${err.stack.split("\n").slice(0, 5).join("\n")}` : ""}`;
  }
  try {
    return JSON.stringify(err).slice(0, 2000);
  } catch {
    return String(err).slice(0, 2000);
  }
}

function log(level: LogLevel, message: string, ctx: LogContext = {}): void {
  // "Never throws" is a hard contract (log calls sit in catch blocks and
  // request paths) — every serialization step is guarded, including meta
  // (circular structures would otherwise throw out of the logger itself).
  let full: string;
  try {
    const prefix = `[pushpanel:${level}]`;
    const suffix = formatContext(ctx);
    const line = `${prefix} ${message}${suffix}`;
    let meta = "";
    if (ctx.meta) {
      try {
        meta = ` ${JSON.stringify(ctx.meta).slice(0, 2000)}`;
      } catch {
        meta = " [unserializable meta]";
      }
    }
    const err = ctx.error ? ` — ${serializeError(ctx.error)}` : "";
    full = `${line}${meta}${err}`;
  } catch {
    full = `[pushpanel:${level}] ${message} [log-format-failed]`;
  }

  // Use appropriate console level; pino is not bundled in web process by default
  switch (level) {
    case "debug":
      if (process.env.NODE_ENV !== "production") console.debug(full);
      break;
    case "info":
      console.info(full);
      break;
    case "warn":
      console.warn(full);
      break;
    case "error":
      console.error(full);
      break;
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
  /** Measure a sync or async operation, log duration + outcome */
  async measure<T>(msg: string, fn: () => T | Promise<T>, ctx: LogContext = {}): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      log("info", `${msg} — ok`, { ...ctx, durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      log("error", `${msg} — failed`, { ...ctx, durationMs, error });
      throw error;
    }
  },
};

/** Pre-built audit-style helpers for admin panel */
export function logAdminAction(action: string, ctx: Omit<LogContext, "action"> & { action?: string }) {
  logger.info(`admin:${action}`, { ...ctx, action });
}
export function logAdminWarning(action: string, ctx: LogContext) {
  logger.warn(`admin:${action}`, { ...ctx, action });
}
export function logAdminError(action: string, error: unknown, ctx: LogContext = {}) {
  logger.error(`admin:${action}`, { ...ctx, action, error });
}
