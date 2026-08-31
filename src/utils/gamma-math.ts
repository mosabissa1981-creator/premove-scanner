/**
 * Global gamma profile math engine (ticker-agnostic).
 *
 * - **Bar/localized GEX:** left-to-right cumsum rebased at gamma flip
 * - **BS simulation:** independent portfolio total at each S_sim, rebased at flip
 *   (never cumsum on simulated totals)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  simulatedSpot: number;
  profile: number;
  rawNetGex?: number;
}

export interface RebasedProfilePoint {
  x: number;
  profile: number;
  rawValue?: number;
}

export interface GammaProfileSimOptions {
  riskFreeRate?: number;
  defaultIv?: number;
  steps?: number;
  paddingPct?: number;
  asOfDate?: string;
  gammaFlip?: number | null;
  /** Max DTE included in BS profile/flip math (default 120). Pass `null` to disable. */
  maxDte?: number | null;
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

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

export function findFlipIndexFromPrice(xs: number[], gammaFlip: number): number {
  let flipIndex = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] <= gammaFlip) flipIndex = i;
  }
  return flipIndex;
}

// ---------------------------------------------------------------------------
// Bar profile (cumsum only — never used for BS simulation)
// ---------------------------------------------------------------------------

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

/** Localized per-strike bar GEX → cumsum profile at gamma flip. */
export function buildLocalizedBarProfileAtFlip(
  strikes: number[],
  localizedNetGex: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildCumsumProfileAtFlip(strikes, localizedNetGex, gammaFlip);
}

/** @deprecated Use `buildLocalizedBarProfileAtFlip`. */
export function buildProfileAtFlip(
  xs: number[],
  localizedValues: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildLocalizedBarProfileAtFlip(xs, localizedValues, gammaFlip);
}

// ---------------------------------------------------------------------------
// BS simulation profile (isolated rebase only — never cumsum)
// ---------------------------------------------------------------------------

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

/** @deprecated Use `buildIsolatedRebaseAtFlip`. */
export function buildProfileAtFlipFromIsolated(
  xs: number[],
  isolatedTotals: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildIsolatedRebaseAtFlip(xs, isolatedTotals, gammaFlip);
}

/** @deprecated Use `buildIsolatedRebaseAtFlip`. */
export function rebaseProfileAtFlip(
  xs: number[],
  rawValues: number[],
  gammaFlip: number,
): RebasedProfilePoint[] {
  return buildIsolatedRebaseAtFlip(xs, rawValues, gammaFlip);
}

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

// ---------------------------------------------------------------------------
// Black-Scholes simulation primitives
// ---------------------------------------------------------------------------

const DEFAULT_RISK_FREE_RATE = 0.05;
const DEFAULT_IV = 0.25;
const DEFAULT_STEPS = 200;
const DEFAULT_PADDING_PCT = 0.35;
/** Exclude LEAPs / ultra-long expiries from short-term gamma profile + flip math. */
export const MAX_GEX_PROFILE_DTE = 120;
const MS_PER_DAY = 86_400_000;

/** Default risk-free rate used in Black-Scholes gamma (aligned to ~5% Treasury). */
export function defaultRiskFreeRate(): number {
  return DEFAULT_RISK_FREE_RATE;
}

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

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

/** Resolve calendar DTE for a leg (prefers explicit dte, else expiry − asOfDate). */
export function resolveLegDte(leg: OptionChainLeg, asOfDate: string): number {
  if (leg.dte > 0) return leg.dte;
  const end = Date.parse(leg.expiry.slice(0, 10));
  const start = Date.parse(asOfDate.slice(0, 10));
  if (Number.isNaN(end) || Number.isNaN(start)) return 0;
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

/**
 * Drop ultra-long-dated legs (LEAPs) from profile / flip math.
 * If filtering would remove every leg (e.g. a single LEAP expiry study), keep the original set.
 */
export function filterLegsByMaxDte(
  legs: OptionChainLeg[],
  maxDte: number = MAX_GEX_PROFILE_DTE,
  asOfDate?: string,
): OptionChainLeg[] {
  if (!legs.length || !Number.isFinite(maxDte) || maxDte <= 0) return legs;
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  const filtered = legs.filter((leg) => resolveLegDte(leg, asOf) <= maxDte);
  return filtered.length ? filtered : legs;
}

/** Keep only contracts expiring on the current trading session (0DTE slice). */
export function filterLegsForOdte(
  legs: OptionChainLeg[],
  tradingDate: string,
): OptionChainLeg[] {
  if (!legs.length) return legs;
  const asOf = tradingDate.slice(0, 10);
  return legs.filter(
    (leg) => leg.expiry.slice(0, 10) === asOf || resolveLegDte(leg, asOf) === 0,
  );
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

/** Total portfolio GEX ($ / 1% move) if the underlying traded at `simulatedSpot`. */
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
 * Independent portfolio total at each simulated spot (no running sum across steps).
 */
export function simulateRawNetGexProfile(
  legs: OptionChainLeg[],
  stockPrice: number,
  options: GammaProfileSimOptions = {},
): RawSimulatedPoint[] {
  if (!legs.length || stockPrice <= 0) return [];

  const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
  const maxDte = options.maxDte === null ? null : (options.maxDte ?? MAX_GEX_PROFILE_DTE);
  const profileLegs =
    maxDte == null ? legs : filterLegsByMaxDte(legs, maxDte, asOfDate);
  if (!profileLegs.length) return [];

  const steps = options.steps ?? DEFAULT_STEPS;
  const paddingPct = options.paddingPct ?? DEFAULT_PADDING_PCT;
  const { min, max } = simulationRange(stockPrice, profileLegs, paddingPct);
  const span = max - min;
  if (span <= 0) return [];

  const riskFreeRate = options.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
  const defaultIv = options.defaultIv ?? DEFAULT_IV;

  const points: RawSimulatedPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const simulatedSpot = min + (span * i) / steps;
    points.push({
      simulatedSpot,
      rawNetGex: totalGammaAtSpot(profileLegs, simulatedSpot, {
        riskFreeRate,
        defaultIv,
        asOfDate,
      }),
    });
  }

  return points;
}

function toSimulatedProfilePoints(rebased: RebasedProfilePoint[]): SimulatedProfilePoint[] {
  return rebased.map((point) => ({
    simulatedSpot: point.x,
    profile: point.profile,
    rawNetGex: point.rawValue,
  }));
}

/**
 * Global BS simulation profile for any ticker.
 *
 * 1. Evaluate independent portfolio total at each S_sim via Black-Scholes
 * 2. Rebase isolated totals to $0 at `gammaFlip` (never cumsum)
 */
export function buildChainSimulatedGammaProfile(
  legs: OptionChainLeg[],
  stockPrice: number,
  gammaFlip: number,
  options: GammaProfileSimOptions = {},
): SimulatedProfilePoint[] {
  if (!legs.length || stockPrice <= 0 || !Number.isFinite(gammaFlip)) return [];

  const raw = simulateRawNetGexProfile(legs, stockPrice, options);
  if (!raw.length) return [];

  const rebased = buildIsolatedRebaseAtFlip(
    raw.map((point) => point.simulatedSpot),
    raw.map((point) => point.rawNetGex),
    gammaFlip,
  );

  return toSimulatedProfilePoints(rebased);
}

/** Rebase precomputed raw BS totals to $0 at gamma flip (isolated, not cumsum). */
export function buildSimulatedProfileFromRawTotals(
  raw: RawSimulatedPoint[],
  gammaFlip: number,
): SimulatedProfilePoint[] {
  const sorted = [...raw].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  if (!sorted.length || !Number.isFinite(gammaFlip)) return [];

  const rebased = buildIsolatedRebaseAtFlip(
    sorted.map((point) => point.simulatedSpot),
    sorted.map((point) => point.rawNetGex),
    gammaFlip,
  );

  return toSimulatedProfilePoints(rebased);
}

export function gammaFlipFromRawProfile(
  raw: RawSimulatedPoint[],
  stockPrice: number,
): number | null {
  if (!raw.length || stockPrice <= 0) return null;

  const sorted = [...raw].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  const minStrike = stockPrice * 0.45;
  let deepest: number | null = null;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.simulatedSpot > stockPrice || prev.simulatedSpot < minStrike) continue;
    if (prev.rawNetGex <= 0 && curr.rawNetGex >= 0) {
      const span = curr.rawNetGex - prev.rawNetGex;
      const flip =
        span === 0
          ? curr.simulatedSpot
          : prev.simulatedSpot +
            (-prev.rawNetGex / span) * (curr.simulatedSpot - prev.simulatedSpot);
      if (deepest == null || flip < deepest) deepest = flip;
    }
  }

  return deepest;
}

// ---------------------------------------------------------------------------
// GEX wall detection (dollar exposure peaks — never OI / contract count)
// ---------------------------------------------------------------------------

export interface GexWallStrikeInput {
  strike: number;
  /** Net dollar GEX (calls positive, puts negative contribution). */
  netGex: number;
  /** Optional call-side dollar GEX; used when present (OptionCharts-style). */
  callGex?: number;
  /** Optional put-side dollar GEX (typically ≤ 0); used when present. */
  putGex?: number;
}

export interface GexWallsResult {
  callWall: number | null;
  putWall: number | null;
  gammaMagnet: number | null;
}

/**
 * Put/call walls from per-strike dollar GEX (OptionCharts-style).
 *
 * - **Call wall** (`callWallStrike`): strike with the maximum positive call-side
 *   dollar GEX (falls back to maximum positive net GEX).
 * - **Put wall** (`putWallStrike`): strike with the maximum absolute negative
 *   put-side dollar GEX — `Math.abs(min putGex)` — falling back to
 *   `Math.abs(min netGex)` when putGex is absent.
 *
 * Never uses open interest or contract counts.
 */
export function computeGexWallsFromSeries(
  points: GexWallStrikeInput[],
  stockPrice: number | null,
): GexWallsResult {
  if (!points.length) {
    return { callWall: null, putWall: null, gammaMagnet: null };
  }

  let callWallStrike: number | null = null;
  let callWallScore = -Infinity;
  let putWallStrike: number | null = null;
  let putWallScore = -Infinity; // max |negative dollar GEX|
  let gammaMagnet: number | null = null;
  let magnetAbs = -Infinity;

  const belowSpot = (strike: number) =>
    stockPrice == null || stockPrice <= 0 || strike < stockPrice;
  const aboveSpot = (strike: number) =>
    stockPrice == null || stockPrice <= 0 || strike > stockPrice;

  for (const point of points) {
    const absNet = Math.abs(point.netGex);
    if (absNet > magnetAbs) {
      magnetAbs = absNet;
      gammaMagnet = point.strike;
    }

    // Call wall: peak positive call dollar GEX (else peak positive net GEX)
    const callScore =
      point.callGex != null && Number.isFinite(point.callGex)
        ? point.callGex
        : point.netGex;
    if (aboveSpot(point.strike) && callScore > 0 && callScore > callWallScore) {
      callWallScore = callScore;
      callWallStrike = point.strike;
    }

    // Put wall: peak |negative| put dollar GEX (else |negative| net GEX)
    const putRaw =
      point.putGex != null && Number.isFinite(point.putGex)
        ? point.putGex
        : point.netGex;
    const putAbs = putRaw < 0 ? Math.abs(putRaw) : 0;
    if (belowSpot(point.strike) && putAbs > putWallScore) {
      putWallScore = putAbs;
      putWallStrike = point.strike;
    }
  }

  return {
    callWall: callWallStrike,
    putWall: putWallStrike,
    gammaMagnet,
  };
}
