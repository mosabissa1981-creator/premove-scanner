/**
 * OptionCharts-style gamma profile math shared across API + chart layers.
 *
 * Rebase-at-flip: each x-point is isolated total GEX at that spot; profile = raw - rawAtFlip.
 * Never sum full dollar GEX values across strikes (that creates the $1B cliff bug).
 */

export interface RebasedProfilePoint {
  /** X-axis value (strike or simulated spot). */
  x: number;
  /** Rebased profile ($ / 1% move), anchored at $0 on gamma flip. */
  profile: number;
  /** Optional raw value before rebase (for debugging/tooltips). */
  rawValue?: number;
}

/** Linear interpolation of `values` at coordinate `x` along sorted `xs`. */
export function interpolateSeriesAtX(xs: number[], values: number[], x: number): number {
  if (!xs.length) return 0;
  if (x <= xs[0]) return values[0] ?? 0;
  const last = xs.length - 1;
  if (x >= xs[last]) return values[last] ?? 0;

  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1];
    const x1 = xs[i];
    if (x < x0 || x > x1) continue;
    const span = x1 - x0;
    if (span === 0) return values[i] ?? 0;
    const ratio = (x - x0) / span;
    return (values[i - 1] ?? 0) + ratio * ((values[i] ?? 0) - (values[i - 1] ?? 0));
  }

  return values[last] ?? 0;
}

/**
 * Rebase-at-flip profile used by every chart and simulation path.
 * `profile[i] = rawValues[i] - interpolate(raw, gammaFlip)`
 */
export function rebaseProfileAtFlip(
  xs: number[],
  rawValues: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  const n = xs.length;
  if (!n || !Number.isFinite(gammaFlip)) return [];

  const sorted = xs
    .map((x, index) => ({ x, raw: rawValues[index] ?? 0 }))
    .sort((a, b) => a.x - b.x);
  const sortedXs = sorted.map((point) => point.x);
  const sortedRaw = sorted.map((point) => point.raw);
  const rawAtFlip = interpolateSeriesAtX(sortedXs, sortedRaw, gammaFlip);

  return sorted.map((point) => ({
    x: point.x,
    profile: point.raw - rawAtFlip,
    rawValue: point.raw,
  }));
}

/** Map rebased profile values back onto strike-keyed rows. */
export function applyRebasedProfile<T extends { strike: number }>(
  rows: T[],
  rebased: RebasedProfilePoint[],
): (T & { profile: number })[] {
  const profileByX = new Map(rebased.map((point) => [point.x, point.profile]));
  return rows.map((row) => ({
    ...row,
    profile: profileByX.get(row.strike) ?? 0,
  }));
}
