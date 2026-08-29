/**
 * Whole days from `now` until the given earnings date (UTC day granularity).
 * Returns null for missing/invalid dates, and can be negative if earnings
 * already passed.
 */
export function daysUntilEarnings(
  dateStr: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00Z`);
  const time = target.getTime();
  if (Number.isNaN(time)) return null;

  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((time - startOfToday) / 86_400_000);
}

/**
 * True when earnings fall inside a typical swing hold window, where an
 * IV ramp usually reflects the event rather than organic accumulation.
 */
export function isEarningsSoon(
  daysToEarnings: number | null,
  windowDays = 12,
): boolean {
  return daysToEarnings !== null && daysToEarnings >= 0 && daysToEarnings <= windowDays;
}
