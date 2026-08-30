/** Option chain leg for spot-simulated gamma profile (OptionCharts-style). */
export interface OptionChainLeg {
  strike: number;
  type: "C" | "P";
  oi: number;
  iv: number;
  expiry: string;
  dte: number;
}

export interface RawSimulatedPoint {
  simulatedSpot: number;
  rawNetGex: number;
}

export interface SimulatedProfilePoint {
  /** Hypothetical underlying spot price used in this simulation step. */
  simulatedSpot: number;
  /** Rebased cumulative profile (0 at gamma flip). */
  profile: number;
  rawNetGex?: number;
}

export interface GammaProfileSimOptions {
  riskFreeRate?: number;
  defaultIv?: number;
  steps?: number;
  paddingPct?: number;
  /** Trading session date (YYYY-MM-DD) for per-contract time to expiry. */
  asOfDate?: string;
  /** When set, rebase the cumulative profile at this flip price. */
  gammaFlip?: number | null;
}

const DEFAULT_RISK_FREE_RATE = 0.04;
const DEFAULT_IV = 0.25;
const DEFAULT_STEPS = 200;
const DEFAULT_PADDING_PCT = 0.35;
const MS_PER_DAY = 86_400_000;

/** Standard normal PDF. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Black-Scholes gamma for a single option contract. */
export function blackScholesGamma(
  spot: number,
  strike: number,
  timeYears: number,
  riskFreeRate: number,
  iv: number,
): number {
  if (timeYears <= 0 || iv <= 0 || spot <= 0 || strike <= 0) return 0;
  const sqrtT = Math.sqrt(timeYears);
  const d1 =
    (Math.log(spot / strike) + (riskFreeRate + 0.5 * iv * iv) * timeYears) / (iv * sqrtT);
  return normPdf(d1) / (spot * iv * sqrtT);
}

/** Dollar gamma exposure ($ / 1% move) for one contract at a simulated spot. */
export function dollarGammaExposure(
  simulatedSpot: number,
  strike: number,
  timeYears: number,
  riskFreeRate: number,
  iv: number,
  oi: number,
  type: "C" | "P",
): number {
  const unitGamma = blackScholesGamma(simulatedSpot, strike, timeYears, riskFreeRate, iv);
  const direction = type === "C" ? 1 : -1;
  return unitGamma * oi * 100 * simulatedSpot * simulatedSpot * 0.01 * direction;
}

export function contractTimeYears(leg: OptionChainLeg, asOfDate: string): number {
  if (leg.dte > 0) return Math.max(leg.dte / 365, 1 / 365);
  return yearsToExpiry(leg.expiry, asOfDate);
}

function yearsToExpiry(expiry: string, asOfDate: string): number {
  const end = Date.parse(expiry.slice(0, 10));
  const start = Date.parse(asOfDate.slice(0, 10));
  if (Number.isNaN(end) || Number.isNaN(start)) return 1 / 365;
  const days = Math.max(0, (end - start) / MS_PER_DAY);
  return Math.max(days / 365, 1 / 365);
}

function simulationRange(
  stockPrice: number,
  legs: OptionChainLeg[],
  paddingPct: number,
): { min: number; max: number } {
  let minSpot = stockPrice * (1 - paddingPct);
  let maxSpot = stockPrice * (1 + paddingPct);
  for (const leg of legs) {
    if (leg.oi <= 0) continue;
    minSpot = Math.min(minSpot, leg.strike);
    maxSpot = Math.max(maxSpot, leg.strike);
  }
  return { min: minSpot, max: maxSpot };
}

/** Total market GEX ($ / 1% move) if the underlying traded at `simulatedSpot`. */
export function totalGammaAtSpot(
  legs: OptionChainLeg[],
  simulatedSpot: number,
  options: GammaProfileSimOptions = {},
): number {
  const r = options.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
  const defaultIv = options.defaultIv ?? DEFAULT_IV;
  const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
  let totalGex = 0;

  for (const leg of legs) {
    if (leg.oi <= 0) continue;
    const iv = leg.iv > 0 ? leg.iv : defaultIv;
    const timeYears = contractTimeYears(leg, asOfDate);
    totalGex += dollarGammaExposure(
      simulatedSpot,
      leg.strike,
      timeYears,
      r,
      iv,
      leg.oi,
      leg.type,
    );
  }

  return totalGex;
}

/**
 * Step 1: raw Net GEX at each simulated spot along the x-axis.
 * Each loop iteration resets the accumulator — no running sum across spots.
 */
export function simulateRawNetGexProfile(
  legs: OptionChainLeg[],
  stockPrice: number,
  options: GammaProfileSimOptions = {},
): RawSimulatedPoint[] {
  if (!legs.length || stockPrice <= 0) return [];

  const steps = options.steps ?? DEFAULT_STEPS;
  const paddingPct = options.paddingPct ?? DEFAULT_PADDING_PCT;
  const { min, max } = simulationRange(stockPrice, legs, paddingPct);
  const span = max - min;
  if (span <= 0) return [];

  const simOptions: GammaProfileSimOptions = {
    riskFreeRate: options.riskFreeRate,
    defaultIv: options.defaultIv,
    asOfDate: options.asOfDate,
  };

  const points: RawSimulatedPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const simulatedSpot = min + (span * i) / steps;
    let totalGex = 0;
    for (const leg of legs) {
      if (leg.oi <= 0) continue;
      const iv = leg.iv > 0 ? leg.iv : (simOptions.defaultIv ?? DEFAULT_IV);
      const timeYears = contractTimeYears(leg, simOptions.asOfDate ?? new Date().toISOString().slice(0, 10));
      totalGex += dollarGammaExposure(
        simulatedSpot,
        leg.strike,
        timeYears,
        simOptions.riskFreeRate ?? DEFAULT_RISK_FREE_RATE,
        iv,
        leg.oi,
        leg.type,
      );
    }
    points.push({ simulatedSpot, rawNetGex: totalGex });
  }

  return points;
}

function interpolateSeriesAtSpot(
  points: { simulatedSpot: number }[],
  values: number[],
  spot: number,
): number {
  if (!points.length) return 0;
  if (spot <= points[0].simulatedSpot) return values[0];
  const last = points.length - 1;
  if (spot >= points[last].simulatedSpot) return values[last];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (spot < prev.simulatedSpot || spot > curr.simulatedSpot) continue;
    const span = curr.simulatedSpot - prev.simulatedSpot;
    if (span === 0) return values[i];
    const ratio = (spot - prev.simulatedSpot) / span;
    return values[i - 1] + ratio * (values[i] - values[i - 1]);
  }

  return values[last];
}

/** Step 2: rising zero crossing of raw Net GEX below spot. */
export function gammaFlipFromRawProfile(
  raw: RawSimulatedPoint[],
  stockPrice: number,
): number | null {
  if (!raw.length || stockPrice <= 0) return null;

  const sorted = [...raw].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  const minStrike = stockPrice * 0.45;

  for (let i = sorted.length - 1; i >= 1; i--) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.simulatedSpot > stockPrice || prev.simulatedSpot < minStrike) continue;
    if (prev.rawNetGex <= 0 && curr.rawNetGex >= 0) {
      const span = curr.rawNetGex - prev.rawNetGex;
      if (span === 0) return curr.simulatedSpot;
      const ratio = -prev.rawNetGex / span;
      return prev.simulatedSpot + ratio * (curr.simulatedSpot - prev.simulatedSpot);
    }
  }

  return null;
}

/** Step 3: index of the last simulated spot at or below the gamma flip price. */
export function flipIndexForPrice(raw: RawSimulatedPoint[], gammaFlip: number): number {
  const sorted = [...raw].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  let flipIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].simulatedSpot <= gammaFlip) flipIndex = i;
  }
  return flipIndex;
}

/**
 * Steps 4–5: cumulative profile rebased to $0 at the gamma flip.
 * - After flip index: forward running sum of spot-to-spot deltas
 * - Before flip index: backward running sum from flip
 * - Subtract interpolated cumulative value at the exact flip price
 */
export function buildRebaseAtFlipProfile(
  raw: RawSimulatedPoint[],
  gammaFlip: number,
): SimulatedProfilePoint[] {
  const sorted = [...raw].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  if (!sorted.length || !Number.isFinite(gammaFlip)) return [];

  const flipIndex = flipIndexForPrice(sorted, gammaFlip);
  const increments = sorted.map((point, i) =>
    i === 0 ? 0 : point.rawNetGex - sorted[i - 1].rawNetGex,
  );

  const cumulative = new Array(sorted.length).fill(0);

  for (let i = flipIndex + 1; i < sorted.length; i++) {
    cumulative[i] = cumulative[i - 1] + increments[i];
  }

  for (let i = flipIndex - 1; i >= 0; i--) {
    cumulative[i] = cumulative[i + 1] - increments[i + 1];
  }

  const anchor = interpolateSeriesAtSpot(sorted, cumulative, gammaFlip);
  return sorted.map((point, i) => ({
    simulatedSpot: point.simulatedSpot,
    profile: cumulative[i] - anchor,
    rawNetGex: point.rawNetGex,
  }));
}

/** Full OptionCharts profile: raw BS net GEX → cumulative rebase at flip. */
export function simulateGammaProfile(
  legs: OptionChainLeg[],
  stockPrice: number,
  options: GammaProfileSimOptions = {},
): SimulatedProfilePoint[] {
  const raw = simulateRawNetGexProfile(legs, stockPrice, options);
  if (!raw.length) return [];

  const gammaFlip =
    options.gammaFlip ??
    gammaFlipFromRawProfile(raw, stockPrice) ??
    stockPrice;

  return buildRebaseAtFlipProfile(raw, gammaFlip);
}

export function interpolateSimulatedProfile(
  profile: SimulatedProfilePoint[],
  spot: number,
): number | null {
  if (!profile.length || !Number.isFinite(spot)) return null;
  const sorted = [...profile].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  if (spot <= sorted[0].simulatedSpot) return sorted[0].profile;
  const last = sorted[sorted.length - 1];
  if (spot >= last.simulatedSpot) return last.profile;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (spot < prev.simulatedSpot || spot > curr.simulatedSpot) continue;
    const span = curr.simulatedSpot - prev.simulatedSpot;
    if (span === 0) return curr.profile;
    const ratio = (spot - prev.simulatedSpot) / span;
    return prev.profile + ratio * (curr.profile - prev.profile);
  }

  return null;
}

/** Deepest rising zero crossing of the rebased profile below spot. */
export function gammaFlipFromSimulatedProfile(
  profile: SimulatedProfilePoint[],
  stockPrice: number,
): number | null {
  if (!profile.length || stockPrice <= 0) return null;

  const sorted = [...profile].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  const minStrike = stockPrice * 0.45;

  for (let i = sorted.length - 1; i >= 1; i--) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.simulatedSpot > stockPrice || prev.simulatedSpot < minStrike) continue;
    if (prev.profile <= 0 && curr.profile >= 0) {
      const span = curr.profile - prev.profile;
      if (span === 0) return curr.simulatedSpot;
      const ratio = -prev.profile / span;
      return prev.simulatedSpot + ratio * (curr.simulatedSpot - prev.simulatedSpot);
    }
  }

  return null;
}

/** Merge dense simulated profile with bar strikes for a smooth curve + accurate tooltips. */
export function mergeSimulatedProfileOntoBars(
  bars: { strike: number; callGex: number; putGex: number; netGex: number; profile: number }[],
  profile: SimulatedProfilePoint[],
  gammaFlip: number | null = null,
): typeof bars {
  if (!profile.length) {
    return bars.map((point) => ({ ...point, profile: 0 }));
  }

  const sortedProfile = [...profile].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  const barByStrike = new Map(bars.map((bar) => [bar.strike, bar]));

  const merged: typeof bars = [];
  for (const point of sortedProfile) {
    const bar = barByStrike.get(point.simulatedSpot);
    if (bar) {
      merged.push({ ...bar, profile: point.profile });
      continue;
    }
    merged.push({
      strike: point.simulatedSpot,
      callGex: 0,
      putGex: 0,
      netGex: 0,
      profile: point.profile,
    });
  }

  for (const bar of bars) {
    if (!merged.some((point) => Math.abs(point.strike - bar.strike) < 1e-6)) {
      merged.push({
        ...bar,
        profile: interpolateSimulatedProfile(profile, bar.strike) ?? 0,
      });
    }
  }

  const sorted = merged.sort((a, b) => a.strike - b.strike);
  if (gammaFlip == null) return sorted;

  const hasFlip = sorted.some((point) => Math.abs(point.strike - gammaFlip) < 1e-6);
  if (hasFlip) return sorted;

  const anchor = {
    strike: gammaFlip,
    callGex: 0,
    putGex: 0,
    netGex: 0,
    profile: 0,
  };
  return [...sorted, anchor].sort((a, b) => a.strike - b.strike);
}

/** Remove duplicate contracts (same expiry/strike/type). */
export function dedupeChainLegs(legs: OptionChainLeg[]): OptionChainLeg[] {
  const byKey = new Map<string, OptionChainLeg>();
  for (const leg of legs) {
    const key = `${leg.expiry}|${leg.strike}|${leg.type}`;
    const existing = byKey.get(key);
    if (!existing || leg.oi > existing.oi) {
      byKey.set(key, leg);
    }
  }
  return [...byKey.values()];
}
