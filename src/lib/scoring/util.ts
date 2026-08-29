/** Clamp a number to the [0, 1] range. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Linear ramp: 0 at/below `lo`, 1 at/above `hi`, linear in between.
 * Used to turn a raw metric into a 0..1 "how strong" strength.
 */
export function ramp(value: number, lo: number, hi: number): number {
  if (hi === lo) return value >= hi ? 1 : 0;
  return clamp01((value - lo) / (hi - lo));
}

/**
 * Map a strength (0..1) into a floored contribution factor so that a signal
 * which is "on" always contributes at least `floor` of its points, scaling up
 * to 1 at full strength.
 */
export function gradedFactor(strength: number, floor = 0.4): number {
  return floor + (1 - floor) * clamp01(strength);
}
