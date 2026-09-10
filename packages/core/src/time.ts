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
/** Bounded cache: `isValidTimezone` is fed attacker-controlled strings from
 *  the public subscribe API, so an uncapped invalid-zone set would leak. */
const MAX_ZONE_CACHE = 500;
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

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
    if (VALID_ZONES.size >= MAX_ZONE_CACHE) VALID_ZONES.clear();
    VALID_ZONES.add(tz);
    return true;
  } catch {
    if (INVALID_ZONES.size >= MAX_ZONE_CACHE) INVALID_ZONES.clear();
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
  // Fractional seconds are accepted and truncated (a `datetime-local` value
  // never has them, but API clients send ISO strings) — without this the
  // function silently fell back to server-local Date.parse and ignored the
  // supplied timezone.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?$/.exec(naive.trim());
  if (!match) {
    const fallback = Date.parse(naive);
    return Number.isNaN(fallback) ? NaN : Math.round(fallback / 1000) * 1000;
  }
  // Range-check the components: Date.UTC normalizes overflows ("2026-13-99"
  // becomes a real 2027 date), which would silently schedule a nonsense time
  // instead of failing validation upstream. Return NaN like Date.parse.
  const [y, mo, d, h, mi, s] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return NaN;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return NaN;
  // The wall-clock reading expressed as a UTC epoch — the reference point
  // every timezone offset is measured against.
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (timeZone === undefined || timeZone === "") return Math.round(Date.parse(naive) / 1000) * 1000;

  const offsetAt = (instantMs: number): number => {
    let dtf = FORMATTERS.get(timeZone);
    if (!dtf) {
      dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      FORMATTERS.set(timeZone, dtf);
    }
    const parts: Record<string, string> = {};
    for (const part of dtf.formatToParts(instantMs)) parts[part.type] = part.value;
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return asUtc - instantMs;
  };

  // wall(instant) = instant + offset(instant);  instant = wallAsUtc - offset(instant).
  // Fixed-point iterate and collect every candidate. For zones east of UTC
  // the naive single-pass result is already past the transition, so both
  // samples can carry the post-transition offset; collecting candidates from
  // each iteration keeps the pre-transition interpretation available.
  const candidates = new Set<number>();
  let utc = wallAsUtc - offsetAt(wallAsUtc);
  candidates.add(utc);
  for (let pass = 0; pass < 3; pass++) {
    const next = wallAsUtc - offsetAt(utc);
    candidates.add(next);
    if (next === utc) break;
    utc = next;
  }
  // Normal day + fall-back overlap: a candidate that round-trips is correct.
  for (const candidate of candidates) {
    if (candidate + offsetAt(candidate) === wallAsUtc) return candidate;
  }
  // DST spring-forward gap (requested wall clock does not exist): no
  // candidate round-trips. Snap FORWARD to the latest candidate, i.e. the
  // smallest offset — 02:30 becomes 03:30 local in both east and west zones
  // (the old Math.min(verify, offsetAt(wallAsUtc)) picked the pre-transition
  // offset for positive-UTC zones and moved the clock backwards).
  return Math.max(...candidates);
}