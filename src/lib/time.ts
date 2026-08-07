/**
 * Wall-clock time in a named zone ↔ instants.
 *
 * Cloudflare Workers has no local timezone: `new Date("2026-08-10T18:00")` is parsed as UTC, so a
 * booking a client entered as 18:00 in Warsaw would be stored as 20:00 local and displayed back
 * wrong. Nothing throws, nothing logs, and in December the error is one hour instead of two — so
 * a test written in winter and a test written in summer disagree while both look plausible.
 *
 * No dependency: `Intl` is in the runtime already, and pulling a date library into a Worker for
 * two functions is a poor trade.
 */

/**
 * Read the wall-clock parts of an instant as seen in `timeZone`, as if they were UTC.
 * The gap between this and the instant itself IS the zone's offset at that moment.
 */
function wallClockAsUtc(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  // `hour12: false` renders midnight as 24 in some ICU versions; normalise it.
  const hour = get("hour") % 24;

  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

/**
 * Turn a date (`YYYY-MM-DD`) and a time (`HH:MM`) entered in `timeZone` into the instant they name.
 *
 * Returns null when the strings are not the shapes an `<input type="date">` and
 * `<input type="time">` produce — a hand-crafted POST must fail validation, not land a booking on
 * an Invalid Date.
 *
 * DST caveat: the correction is applied once, which is exact except inside the one-hour window a
 * transition creates. A time that does not exist (spring forward) resolves to the following hour,
 * and an ambiguous one (autumn) resolves to the first occurrence. Both are defensible for a
 * booking, and neither is worth an iteration loop here — but do not reuse this for billing.
 */
export function composeInZone(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;

  const naive = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;

  const offset = wallClockAsUtc(naive, timeZone) - naive.getTime();
  return new Date(naive.getTime() - offset);
}

/** Render an instant as wall-clock time in `timeZone`, for the active locale. */
export function formatInZone(instant: Date | string, locale: string, timeZone: string): string {
  const value = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
