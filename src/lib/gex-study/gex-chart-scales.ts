export const BAR_HEIGHT_RATIO = 0.32;
export const PROFILE_SCALE_PADDING = 0.12;

export interface YAxisScale {
  domainMin: number;
  domainMax: number;
  toY: (value: number) => number;
  ticks: number[];
}

/** Left axis: Net GEX bars only (centered band, millions-scale). */
export function createBarYScale(
  netGexValues: number[],
  plotTop: number,
  plotHeight: number,
): YAxisScale & { zeroY: number } {
  const values = netGexValues.length ? netGexValues : [0];
  const barMax = Math.max(...values.map((value) => Math.abs(value)), 1);
  const zeroY = plotTop + plotHeight / 2;
  const half = plotHeight * BAR_HEIGHT_RATIO;

  return {
    domainMin: -barMax,
    domainMax: barMax,
    zeroY,
    toY: (netGex: number) => zeroY - (netGex / barMax) * half,
    ticks: [-barMax, -barMax / 2, 0, barMax / 2, barMax],
  };
}

function profileAxisTicks(rawMin: number, rawMax: number): number[] {
  const ticks = new Set<number>([rawMin, rawMax]);
  if (rawMin < 0 && rawMax > 0) ticks.add(0);
  return [...ticks].sort((a, b) => a - b);
}

/** Right axis: gamma profile line only (full plot height, independent domain). */
export function createProfileYScale(
  profileValues: number[],
  plotTop: number,
  plotHeight: number,
): YAxisScale {
  if (!profileValues.length) {
    const zeroY = plotTop + plotHeight / 2;
    return {
      domainMin: -1,
      domainMax: 1,
      toY: () => zeroY,
      ticks: [0],
    };
  }

  const rawMin = Math.min(...profileValues);
  const rawMax = Math.max(...profileValues);
  const range = rawMax - rawMin || 1;
  const domainMin = rawMin - range * PROFILE_SCALE_PADDING;
  const domainMax = rawMax + range * PROFILE_SCALE_PADDING;
  const span = domainMax - domainMin || 1;

  return {
    domainMin,
    domainMax,
    toY: (profile: number) => plotTop + plotHeight - ((profile - domainMin) / span) * plotHeight,
    ticks: profileAxisTicks(rawMin, rawMax),
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
