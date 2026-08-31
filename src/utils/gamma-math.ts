/**
 * OptionCharts-style gamma profile math shared across API + chart layers.
 *
 * - Bar/localized GEX: left-to-right cumsum rebased at gamma flip
 * - BS simulation totals: isolated portfolio value at each spot, rebased at flip
 */

export interface RebasedProfilePoint {
  /** X-axis value (strike or simulated spot). */
  x: number;
  /** Profile ($ / 1% move), anchored at $0 on gamma flip. */
  profile: number;
  /** Optional raw/localized value before integration (for debugging/tooltips). */
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

/** Index of the last point at or below `gammaFlip` along sorted `xs`. */
export function findFlipIndexFromPrice(xs: number[], gammaFlip: number): number {
  let flipIndex = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] <= gammaFlip) flipIndex = i;
  }
  return flipIndex;
}

/**
 * Left-to-right cumulative sum rebased to $0 at gamma flip.
 * Used for localized per-strike bar GEX (no bidirectional sweep).
 */
export function buildCumsumProfileAtFlip(
  xs: number[],
  values: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  const n = xs.length;
  if (!n || !Number.isFinite(gammaFlip)) return [];

  const sorted = xs
    .map((x, index) => ({ x, value: values[index] ?? 0 }))
    .sort((a, b) => a.x - b.x);
  const sortedXs = sorted.map((point) => point.x);
  const sortedValues = sorted.map((point) => point.value);

  let running = 0;
  const cumsum = sortedValues.map((value) => {
    running += value;
    return running;
  });
  const atFlip = interpolateSeriesAtX(sortedXs, cumsum, gammaFlip);

  return sorted.map((point, index) => ({
    x: point.x,
    profile: (cumsum[index] ?? 0) - atFlip,
    rawValue: point.value,
  }));
}

/**
 * Independent BS portfolio total at each simulated spot → profile = total - total@flip.
 * Each spot is evaluated in isolation (no step-to-step accumulation).
 */
export function buildIsolatedRebaseAtFlip(
  xs: number[],
  isolatedTotals: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  const n = xs.length;
  if (!n || !Number.isFinite(gammaFlip)) return [];

  const sorted = xs
    .map((x, index) => ({ x, isolated: isolatedTotals[index] ?? 0 }))
    .sort((a, b) => a.x - b.x);
  const sortedXs = sorted.map((point) => point.x);
  const sortedIsolated = sorted.map((point) => point.isolated);
  const rawAtFlip = interpolateSeriesAtX(sortedXs, sortedIsolated, gammaFlip);

  return sorted.map((point) => ({
    x: point.x,
    profile: point.isolated - rawAtFlip,
    rawValue: point.isolated,
  }));
}

/** Localized per-strike net GEX → cumsum profile anchored at gamma flip. */
export function buildProfileAtFlip(
  xs: number[],
  localizedValues: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildCumsumProfileAtFlip(xs, localizedValues, gammaFlip);
}

/** Isolated BS portfolio totals per simulated spot → rebase at flip. */
export function buildProfileAtFlipFromIsolated(
  xs: number[],
  isolatedTotals: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildIsolatedRebaseAtFlip(xs, isolatedTotals, gammaFlip);
}

/** @deprecated Use `buildCumsumProfileAtFlip` or `buildIsolatedRebaseAtFlip`. */
export function rebaseProfileAtFlip(
  xs: number[],
  rawValues: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildIsolatedRebaseAtFlip(xs, rawValues, gammaFlip);
}

/** Map profile values back onto strike-keyed rows. */
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
