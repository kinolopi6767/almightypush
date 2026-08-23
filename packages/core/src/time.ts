/**
 * Wall-clock → epoch conversion for naive datetime strings (e.g. the value
 * of an `<input type="datetime-local">`) that carry no timezone information.
 * Campaigns schedule in the panel's configured timezone; naive strings must
 * be interpreted in that timezone, not the server's local one.
 */

/** Thrown when a timezone string is not a valid IANA zone name. */
export class InvalidTimezoneError extends Error {
  constructor(timeZone: string) {
    super(`Invalid timezone: ${timeZone}`);
    this.name = "InvalidTimezoneError";
  }
}

const VALID_ZONES = new Set<string>();
const INVALID_ZONES = new Set<string>();

/**
 * True when `tz` is a valid IANA timezone name (empty is allowed).
 * `Intl.DateTimeFormat` construction is the ground truth; `supportedValuesOf`
 * omits zones on some ICU builds (e.g. "Asia/Kolkata" on Node 24 small-icu).
 */
export function isValidTimezone(tz: string | undefined | null): boolean {
  if (!tz) return true;
  if (VALID_ZONES.has(tz)) return true;
  if (INVALID_ZONES.has(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    VALID_ZONES.add(tz);
    return true;
  } catch {
    INVALID_ZONES.add(tz);
    return false;
  }
}

/**
 * The UTC epoch (ms) at which a given IANA timezone shows the naive wall
 * clock reading `naive` ("YYYY-MM-DDTHH:MM[:SS]"). Falls back to the
 * server-local interpretation when the timezone is missing, and to
 * `Date.parse` semantics when the input is invalid (returns NaN like Date).
 * Throws `InvalidTimezoneError` when an unknown timezone is supplied.
 */
export function naiveLocalToUtcMs(naive: string, timeZone?: string): number {
  if (timeZone !== undefined && timeZone !== "" && !isValidTimezone(timeZone)) {
    throw new InvalidTimezoneError(timeZone);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive.trim());
  if (!match) {
    const fallback = Date.parse(naive);
    return Number.isNaN(fallback) ? NaN : Math.round(fallback / 1000) * 1000;
  }
  // The wall-clock reading expressed as a UTC epoch — the reference point
  // every timezone offset is measured against.
  const wallAsUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
  if (timeZone === undefined || timeZone === "") return Math.round(Date.parse(naive) / 1000) * 1000;

  const offsetAt = (instantMs: number): number => {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts: Record<string, string> = {};
    for (const part of dtf.formatToParts(instantMs)) parts[part.type] = part.value;
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return asUtc - instantMs;
  };

  // wall(instant) = instant + offset(instant);  instant = wallAsUtc - offset(instant).
  let utc = wallAsUtc - offsetAt(wallAsUtc);
  const secondPass = wallAsUtc - offsetAt(utc);
  if (secondPass !== utc) utc = secondPass;

  // DST spring-forward gap guard: inside the gap the fixed-point iteration
  // oscillates and never converges. Verify the result round-trips to the
  // requested wall clock; if not, snap forward to the post-transition
  // instant (conventional gap resolution — 02:30 becomes 03:30 local).
  const verify = offsetAt(utc);
  if (utc + verify !== wallAsUtc) {
    utc = wallAsUtc - Math.min(verify, offsetAt(wallAsUtc));
  }
  return utc;
}