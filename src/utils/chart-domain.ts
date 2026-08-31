/**
 * Dual-axis chart domain helpers (bars left, profile right).
 * Symmetric profile domain keeps $0 vertically aligned with the bar axis center.
 */

export const BAR_HEIGHT_RATIO = 0.32;
export const PROFILE_SCALE_PADDING = 0.12;

export interface SymmetricDomain {
  domainMin: number;
  domainMax: number;
  maxAbs: number;
}

export interface YAxisScale extends SymmetricDomain {
  toY: (value: number) => number;
  ticks: number[];
}

export interface StrikeXScale {
  domainMin: number;
  domainMax: number;
  toX: (strike: number) => number;
}

/** Numeric strike domain from data (always ascending). */
export function strikeDomainFromValues(strikes: number[]): { domainMin: number; domainMax: number } {
  if (!strikes.length) return { domainMin: 0, domainMax: 1 };
  const numeric = strikes.map((strike) => Number(strike)).filter((strike) => Number.isFinite(strike));
  if (!numeric.length) return { domainMin: 0, domainMax: 1 };
  return { domainMin: Math.min(...numeric), domainMax: Math.max(...numeric) };
}

/** Numeric X-axis scale: maps raw strike prices left→right across the plot width. */
export function createStrikeXScale(
  domainMin: number,
  domainMax: number,
  plotLeft: number,
  plotWidth: number,
): StrikeXScale {
  const min = Number(domainMin);
  const max = Number(domainMax);
  const span = max - min || 1;

  return {
    domainMin: min,
    domainMax: max,
    toX: (strike: number) => plotLeft + ((Number(strike) - min) / span) * plotWidth,
  };
}

/** Perfectly symmetrical domain: [-maxAbs, +maxAbs] with optional padding. */
export function symmetricDomain(
  values: number[],
  paddingRatio = PROFILE_SCALE_PADDING,
): SymmetricDomain {
  if (!values.length) {
    return { domainMin: -1, domainMax: 1, maxAbs: 1 };
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const maxAbs = Math.max(Math.abs(rawMin), Math.abs(rawMax), 1);
  const paddedMax = maxAbs * (1 + paddingRatio);

  return {
    domainMin: -paddedMax,
    domainMax: paddedMax,
    maxAbs,
  };
}

function profileAxisTicks(maxAbs: number): number[] {
  const ticks = new Set<number>([-maxAbs, maxAbs, 0]);
  return [...ticks].sort((a, b) => a - b);
}

/** Left Y-axis: Net GEX bars (center band, symmetric around plot center). */
export function createBarYScale(
  netGexValues: number[],
  plotTop: number,
  plotHeight: number,
): YAxisScale & { zeroY: number } {
  const { domainMin, domainMax, maxAbs } = symmetricDomain(
    netGexValues.length ? netGexValues : [0],
    0,
  );
  const barMax = maxAbs;
  const zeroY = plotTop + plotHeight / 2;
  const half = plotHeight * BAR_HEIGHT_RATIO;

  return {
    domainMin,
    domainMax,
    maxAbs,
    zeroY,
    toY: (netGex: number) => zeroY - (netGex / barMax) * half,
    ticks: [-barMax, -barMax / 2, 0, barMax / 2, barMax],
  };
}

/** Right Y-axis: gamma profile line (full plot height, symmetric domain). */
export function createProfileYScale(
  profileValues: number[],
  plotTop: number,
  plotHeight: number,
): YAxisScale {
  const zeroY = plotTop + plotHeight / 2;

  if (!profileValues.length) {
    return {
      domainMin: -1,
      domainMax: 1,
      maxAbs: 1,
      toY: () => zeroY,
      ticks: [0],
    };
  }

  const { domainMin, domainMax, maxAbs } = symmetricDomain(profileValues);
  const span = domainMax - domainMin;

  return {
    domainMin,
    domainMax,
    maxAbs,
    toY: (profile: number) => plotTop + plotHeight - ((profile - domainMin) / span) * plotHeight,
    ticks: profileAxisTicks(maxAbs),
  };
}

/** Deduplicate by strike and sort for a continuous profile polyline. */
export function profileSeriesPoints<T extends { strike: number; profile: number }>(
  points: T[],
): T[] {
  const byStrike = new Map<number, T>();
  for (const point of points) {
    const existing = byStrike.get(point.strike);
    if (!existing || Math.abs(point.profile) >= Math.abs(existing.profile)) {
      byStrike.set(point.strike, point);
    }
  }
  return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
}
