/**
 * OptionCharts-style gamma profile math shared across API + chart layers.
 *
 * Bidirectional sweep: anchor profile at $0 on gamma flip, accumulate localized
 * net GEX left and right from the flip index. Isolated BS simulation totals
 * rebase via subtraction at the flip spot.
 */

export interface RebasedProfilePoint {
  /** X-axis value (strike or simulated spot). */
  x: number;
  /** Profile ($ / 1% move), anchored at $0 on gamma flip. */
  profile: number;
  /** Optional raw/localized value before sweep (for debugging/tooltips). */
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

/** Index where localized net GEX crosses from non-positive to positive. */
export function findFlipIndexFromSignChange(values: number[]): number {
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] <= 0 && values[i] > 0) return i;
  }
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] <= 0) return i;
  }
  return 0;
}

/**
 * Bidirectional cumulative profile when flip lands exactly on a strike index.
 *
 * - finalProfile[flipIndex] = 0
 * - Right: finalProfile[i] = finalProfile[i - 1] + localized[i]
 * - Left:  finalProfile[i] = finalProfile[i + 1] + localized[i]
 */
export function buildBidirectionalProfileAtFlip(
  localizedValues: number[],
  flipIndex: number,
): number[] {
  const n = localizedValues.length;
  const profile = new Array<number>(n).fill(0);
  if (!n) return profile;

  const anchor = Math.max(0, Math.min(flipIndex, n - 1));
  profile[anchor] = 0;

  for (let i = anchor + 1; i < n; i++) {
    profile[i] = profile[i - 1] + (localizedValues[i] ?? 0);
  }

  for (let i = anchor - 1; i >= 0; i--) {
    profile[i] = profile[i + 1] + (localizedValues[i] ?? 0);
  }

  return profile;
}

/**
 * Localized per-strike net GEX → bidirectional profile anchored at gamma flip.
 * Sweeps from the last strike at or below flip, then shifts so profile = 0 at flip price.
 */
export function buildProfileAtFlip(
  xs: number[],
  localizedValues: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  const n = xs.length;
  if (!n || !Number.isFinite(gammaFlip)) return [];

  const sorted = xs
    .map((x, index) => ({ x, localized: localizedValues[index] ?? 0 }))
    .sort((a, b) => a.x - b.x);
  const sortedXs = sorted.map((point) => point.x);
  const sortedLocalized = sorted.map((point) => point.localized);
  const flipIndex = findFlipIndexFromPrice(sortedXs, gammaFlip);
  const profiles = buildBidirectionalProfileAtFlip(sortedLocalized, flipIndex);
  const atFlip = interpolateSeriesAtX(sortedXs, profiles, gammaFlip);

  return sorted.map((point, index) => ({
    x: point.x,
    profile: (profiles[index] ?? 0) - atFlip,
    rawValue: point.localized,
  }));
}

/** Isolated BS totals at each simulated spot → profile = raw - rawAtFlip. */
export function buildProfileAtFlipFromIsolated(
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

/** @deprecated Use `buildProfileAtFlip` for bars or `buildProfileAtFlipFromIsolated` for BS sim. */
export function rebaseProfileAtFlip(
  xs: number[],
  rawValues: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildProfileAtFlipFromIsolated(xs, rawValues, gammaFlip);
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
