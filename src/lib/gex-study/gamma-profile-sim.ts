/** Option chain leg for spot-simulated gamma profile (OptionCharts-style). */
export interface OptionChainLeg {
  strike: number;
  type: "C" | "P";
  oi: number;
  iv: number;
  expiry: string;
  dte: number;
}

export interface SimulatedProfilePoint {
  strike: number;
  profile: number;
}

export interface GammaProfileSimOptions {
  riskFreeRate?: number;
  defaultIv?: number;
  steps?: number;
  paddingPct?: number;
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
  spot: number,
  strike: number,
  timeYears: number,
  riskFreeRate: number,
  iv: number,
  oi: number,
  type: "C" | "P",
): number {
  const gamma = blackScholesGamma(spot, strike, timeYears, riskFreeRate, iv);
  const direction = type === "C" ? 1 : -1;
  return gamma * oi * 100 * spot * spot * 0.01 * direction;
}

function yearsToExpiry(expiry: string, asOf: Date): number {
  const end = Date.parse(expiry.slice(0, 10));
  const start = Date.parse(asOf.toISOString().slice(0, 10));
  if (Number.isNaN(end) || Number.isNaN(start)) return 0;
  const days = Math.max(0, (end - start) / MS_PER_DAY);
  return Math.max(days / 365, 1 / 365);
}

function simulationRange(
  stockPrice: number,
  legs: OptionChainLeg[],
  paddingPct: number,
): { min: number; max: number } {
  let minStrike = stockPrice * (1 - paddingPct);
  let maxStrike = stockPrice * (1 + paddingPct);
  for (const leg of legs) {
    if (leg.oi <= 0) continue;
    minStrike = Math.min(minStrike, leg.strike);
    maxStrike = Math.max(maxStrike, leg.strike);
  }
  return { min: minStrike, max: maxStrike };
}

/** Total market GEX ($ / 1% move) if the underlying traded at `simulatedSpot`. */
export function totalGammaAtSpot(
  legs: OptionChainLeg[],
  simulatedSpot: number,
  options: GammaProfileSimOptions & { asOf?: Date } = {},
): number {
  const r = options.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
  const defaultIv = options.defaultIv ?? DEFAULT_IV;
  const asOf = options.asOf ?? new Date();
  let total = 0;

  for (const leg of legs) {
    if (leg.oi <= 0) continue;
    const iv = leg.iv > 0 ? leg.iv : defaultIv;
    const timeYears = leg.dte > 0 ? leg.dte / 365 : yearsToExpiry(leg.expiry, asOf);
    total += dollarGammaExposure(simulatedSpot, leg.strike, timeYears, r, iv, leg.oi, leg.type);
  }

  return total;
}

/** OptionCharts-style gamma profile: simulate total GEX across hypothetical spot prices. */
export function simulateGammaProfile(
  legs: OptionChainLeg[],
  stockPrice: number,
  options: GammaProfileSimOptions = {},
): SimulatedProfilePoint[] {
  if (!legs.length || stockPrice <= 0) return [];

  const steps = options.steps ?? DEFAULT_STEPS;
  const paddingPct = options.paddingPct ?? DEFAULT_PADDING_PCT;
  const { min, max } = simulationRange(stockPrice, legs, paddingPct);
  const span = max - min;
  if (span <= 0) return [];

  const simOptions = {
    riskFreeRate: options.riskFreeRate,
    defaultIv: options.defaultIv,
    asOf: new Date(),
  };

  const points: SimulatedProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const strike = min + (span * i) / steps;
    points.push({
      strike,
      profile: totalGammaAtSpot(legs, strike, simOptions),
    });
  }

  return points;
}

export function interpolateSimulatedProfile(
  profile: SimulatedProfilePoint[],
  strike: number,
): number | null {
  if (!profile.length || !Number.isFinite(strike)) return null;
  const sorted = [...profile].sort((a, b) => a.strike - b.strike);
  if (strike <= sorted[0].strike) return sorted[0].profile;
  const last = sorted[sorted.length - 1];
  if (strike >= last.strike) return last.profile;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (strike < prev.strike || strike > curr.strike) continue;
    const span = curr.strike - prev.strike;
    if (span === 0) return curr.profile;
    const ratio = (strike - prev.strike) / span;
    return prev.profile + ratio * (curr.profile - prev.profile);
  }

  return null;
}

/** Deepest rising zero crossing of the simulated profile below spot. */
export function gammaFlipFromSimulatedProfile(
  profile: SimulatedProfilePoint[],
  stockPrice: number,
): number | null {
  if (!profile.length || stockPrice <= 0) return null;

  const sorted = [...profile].sort((a, b) => a.strike - b.strike);
  const minStrike = stockPrice * 0.45;

  for (let i = sorted.length - 1; i >= 1; i--) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.strike > stockPrice || prev.strike < minStrike) continue;
    if (prev.profile <= 0 && curr.profile >= 0) {
      const span = curr.profile - prev.profile;
      if (span === 0) return curr.strike;
      const ratio = -prev.profile / span;
      return prev.strike + ratio * (curr.strike - prev.strike);
    }
  }

  return null;
}

/** Attach simulated profile values to bar strike points. */
export function mergeSimulatedProfileOntoBars(
  bars: { strike: number; callGex: number; putGex: number; netGex: number; profile: number }[],
  profile: SimulatedProfilePoint[],
): typeof bars {
  return bars.map((point) => ({
    ...point,
    profile: interpolateSimulatedProfile(profile, point.strike) ?? 0,
  }));
}
