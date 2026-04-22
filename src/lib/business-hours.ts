// Business-hours gate for the queue worker.
//
// "Business hours" = the org's local 10:00-19:59 window. Messages queued
// outside this window stay pending until the next opening — unless flagged
// urgent (lab reports, appointment confirmations etc.) which bypass the gate.

const DEFAULT_START_HOUR = 10; // 10:00
const DEFAULT_END_HOUR = 20;   // 20:00 (i.e. last sendable hour is 19)
const DEFAULT_TZ = "Asia/Karachi";

// Returns the hour-of-day (0-23) for `now` in the given IANA timezone.
// Intl.DateTimeFormat is the only stdlib path that handles DST correctly
// without pulling in a date library.
export function hourInTimezone(timezone: string, now: Date = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    // Intl can return "24" for midnight in some envs — normalize to 0.
    const h = parseInt(formatted, 10);
    if (Number.isNaN(h)) return now.getUTCHours();
    return h === 24 ? 0 : h;
  } catch {
    // Bad timezone string — fall back to UTC so we don't crash the worker.
    return now.getUTCHours();
  }
}

// True if the org is currently inside its business hours.
export function isWithinBusinessHours(
  timezone: string | null | undefined,
  now: Date = new Date(),
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
): boolean {
  const tz = timezone || DEFAULT_TZ;
  const h = hourInTimezone(tz, now);
  return h >= startHour && h < endHour;
}
