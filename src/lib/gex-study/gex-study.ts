import type { UnusualWhalesClient } from "@/lib/unusualwhales/client";
import {
  dedupeChainLegs,
  mergeSimulatedProfileOntoBars,
  type OptionChainLeg,
} from "@/lib/gex-study/gamma-profile-sim";
import {
  buildChainSimulatedGammaProfile,
  buildLocalizedBarProfileAtFlip,
  computeGexWallsFromSeries,
  filterLegsByMaxDte,
  gammaFlipFromRawProfile,
  MAX_GEX_PROFILE_DTE,
  simulateRawNetGexProfile,
} from "@/utils/gamma-math";
import {
  computeGexLevelsFromUw,
  isRelevantGammaFlip,
  isSaneGammaFlip,
  resolveGammaFlip,
} from "@/lib/scoring/gex";
import { expiryKey, selectExpiryRows, ymd } from "@/lib/gex-scan/gex-scan";
import type {
  GexExpiryMode,
  GexStrikePoint,
  GexStudyResult,
  UwCandle,
  UwDataResponse,
  UwGexLevels,
  UwGreekExposureExpiryRow,
  UwGreekExposureStrikeRow,
  UwOptionChainRow,
  UwOptionContractRow,
  UwSpotExposureSnapshot,
  UwSpotExposureStrikeRow,
} from "@/lib/unusualwhales/types";

function parseNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function latestClose(candles: UwCandle[]): number | null {
  const last = candles[candles.length - 1];
  if (!last?.close) return null;
  const n = parseFloat(last.close);
  return Number.isNaN(n) ? null : n;
}

/** Last session date from OHLC, or the previous weekday when markets are closed. */
export function resolveTradingDate(candles: UwCandle[], now = new Date()): string {
  const last = candles[candles.length - 1];
  const raw = last?.date ?? last?.end_time ?? last?.start_time;
  if (raw) return raw.slice(0, 10);

  const d = new Date(now);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return ymd(d);
}

export function hasUsableSpotStrikes(rows: UwSpotExposureStrikeRow[]): boolean {
  let valid = 0;
  for (const row of rows) {
    const strike = parseNum(row.strike);
    if (strike <= 0) continue;
    if (parseNum(row.call_gamma_oi) !== 0 || parseNum(row.put_gamma_oi) !== 0) valid += 1;
  }
  return valid >= 4;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function aggregateSpotRows(rows: UwSpotExposureStrikeRow[]): UwSpotExposureStrikeRow[] {
  const byStrike = new Map<number, { call: number; put: number }>();
  for (const row of rows) {
    const strike = parseNum(row.strike);
    if (strike <= 0) continue;
    const call = parseNum(row.call_gamma_oi);
    const put = parseNum(row.put_gamma_oi);
    const existing = byStrike.get(strike) ?? { call: 0, put: 0 };
    byStrike.set(strike, { call: existing.call + call, put: existing.put + put });
  }

  return [...byStrike.entries()]
    .sort(([a], [b]) => a - b)
    .map(([strike, gex]) => ({
      strike: String(strike),
      call_gamma_oi: String(gex.call),
      put_gamma_oi: String(gex.put),
    }));
}

function readSpotStrikeGex(row: UwSpotExposureStrikeRow): { callGex: number; putGex: number } {
  return {
    callGex: parseNum(row.call_gamma_oi),
    putGex: parseNum(row.put_gamma_oi),
  };
}

export function buildStrikeSeries(
  rows: UwSpotExposureStrikeRow[],
  stockPrice: number | null = null,
): GexStrikePoint[] {
  const minStrike =
    stockPrice != null && stockPrice > 0 ? stockPrice * 0.15 : 0;

  return buildStrikeSeriesFromRows(rows, (strike) => strike >= minStrike);
}

/** Full-chain series for gamma flip (keeps deep strikes, drops zero-noise junk). */
export function buildFlipSeries(
  rows: UwSpotExposureStrikeRow[],
  stockPrice: number | null = null,
): GexStrikePoint[] {
  return buildStrikeSeriesFromRows(rows, (strike, netGex) => {
    if (strike <= 0) return false;
    if (stockPrice != null && stockPrice > 0 && strike < stockPrice * 0.25) {
      return Math.abs(netGex) >= 1000;
    }
    return true;
  });
}

/** All strikes for profile cumulative (minimal filtering so deep chain mass is retained). */
export function buildProfileSourceSeries(rows: UwSpotExposureStrikeRow[]): GexStrikePoint[] {
  return buildStrikeSeriesFromRows(rows, (strike) => strike > 0);
}

function buildStrikeSeriesFromRows(
  rows: UwSpotExposureStrikeRow[],
  keepStrike: (strike: number, netGex: number) => boolean,
): GexStrikePoint[] {
  const sorted = [...rows]
    .map((row) => {
      const strike = parseNum(row.strike);
      const { callGex, putGex } = readSpotStrikeGex(row);
      const netGex = callGex + putGex;
      return { strike, callGex, putGex, netGex, profile: 0 };
    })
    .filter((row) => keepStrike(row.strike, row.netGex))
    .sort((a, b) => a.strike - b.strike);

  let cumulative = 0;
  for (const point of sorted) {
    cumulative += point.netGex;
    point.profile = cumulative;
  }

  return sorted;
}

export function filterStrikeWindow(
  points: GexStrikePoint[],
  stockPrice: number | null,
  paddingPct = 0.35,
): GexStrikePoint[] {
  if (!points.length) return [];
  if (stockPrice == null || stockPrice <= 0) return points;

  const minStrike = stockPrice * (1 - paddingPct);
  const maxStrike = stockPrice * (1 + paddingPct);
  const filtered = points.filter((p) => p.strike >= minStrike && p.strike <= maxStrike);
  if (filtered.length >= 4) return filtered;

  const centerIdx = points.reduce(
    (best, p, i) =>
      Math.abs(p.strike - stockPrice) < Math.abs(points[best].strike - stockPrice) ? i : best,
    0,
  );
  const half = 20;
  const start = Math.max(0, centerIdx - half);
  const end = Math.min(points.length, centerIdx + half + 1);
  return points.slice(start, end);
}

interface ProfileCrossing {
  strike: number;
  rising: boolean;
}

function collectProfileCrossings(points: GexStrikePoint[]): ProfileCrossing[] {
  const crossings: ProfileCrossing[] = [];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.profile === 0) {
      crossings.push({ strike: prev.strike, rising: curr.profile >= 0 });
      continue;
    }
    if (curr.profile === 0) {
      crossings.push({ strike: curr.strike, rising: prev.profile < 0 });
      continue;
    }
    if ((prev.profile < 0 && curr.profile > 0) || (prev.profile > 0 && curr.profile < 0)) {
      const span = curr.profile - prev.profile;
      const strike =
        span === 0
          ? curr.strike
          : prev.strike + (-prev.profile / span) * (curr.strike - prev.strike);
      crossings.push({ strike, rising: prev.profile < 0 && curr.profile > 0 });
    }
  }

  return crossings;
}

function interpolateRisingCrossing(prev: GexStrikePoint, curr: GexStrikePoint): number {
  const span = curr.profile - prev.profile;
  if (span === 0) return curr.strike;
  const ratio = -prev.profile / span;
  return prev.strike + ratio * (curr.strike - prev.strike);
}

function interpolateNetGexRisingCrossing(prev: GexStrikePoint, curr: GexStrikePoint): number {
  const span = curr.netGex - prev.netGex;
  if (span === 0) return curr.strike;
  const ratio = -prev.netGex / span;
  return prev.strike + ratio * (curr.strike - prev.strike);
}

/** Strike where per-strike net GEX crosses from negative to positive (red bars → green bars). */
export function computeNetGexBarFlip(
  points: GexStrikePoint[],
  stockPrice: number | null,
): number | null {
  if (!points.length || stockPrice == null || stockPrice <= 0) return null;

  const sorted = [...points].sort((a, b) => a.strike - b.strike);
  const minStrike = stockPrice * 0.45;

  for (let i = sorted.length - 1; i >= 1; i--) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.strike > stockPrice || prev.strike < minStrike) continue;
    if (prev.netGex <= 0 && curr.netGex > 0) {
      return interpolateNetGexRisingCrossing(prev, curr);
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.netGex <= 0 && curr.netGex > 0) {
      return interpolateNetGexRisingCrossing(prev, curr);
    }
  }

  return null;
}

/** Recompute cumulative profile from zero at the window start (drops deep-OTM history). */
export function rebaseProfileWindow(
  points: GexStrikePoint[],
  stockPrice: number | null,
): GexStrikePoint[] {
  const window = filterStrikeWindow(points, stockPrice);
  let cumulative = 0;
  return window.map((point) => {
    const profile = cumulative;
    cumulative += point.netGex;
    return { ...point, profile };
  });
}

/** Rising zero crossing below spot inside the near-ATM strike window. */
export function computeGammaFlipFromWindow(
  points: GexStrikePoint[],
  stockPrice: number | null,
): number | null {
  if (!points.length || stockPrice == null || stockPrice <= 0) return null;

  const sorted = [...points].sort((a, b) => a.strike - b.strike);
  const window = filterStrikeWindow(points, stockPrice);
  const windowStrikes = new Set(window.map((point) => point.strike));
  const profileWindow = buildCumulativeProfile(sorted).filter((point) =>
    windowStrikes.has(point.strike),
  );
  const minStrike = stockPrice * 0.45;

  for (let i = profileWindow.length - 1; i >= 1; i--) {
    const prev = profileWindow[i - 1];
    const curr = profileWindow[i];
    if (curr.strike > stockPrice || prev.strike < minStrike) continue;
    if (prev.profile <= 0 && curr.profile >= 0) {
      return interpolateRisingCrossing(prev, curr);
    }
  }

  const crossings = collectProfileCrossings(profileWindow).filter(
    (crossing) => crossing.strike >= minStrike && crossing.strike <= stockPrice + 1e-6,
  );
  if (!crossings.length) return null;

  const belowSpot = crossings.filter((crossing) => crossing.strike <= stockPrice + 1e-6);
  if (belowSpot.length) {
    return belowSpot.reduce((best, crossing) =>
      crossing.strike > best.strike ? crossing : best,
    ).strike;
  }

  return crossings.reduce((best, crossing) =>
    Math.abs(crossing.strike - stockPrice) < Math.abs(best.strike - stockPrice)
      ? crossing
      : best,
  ).strike;
}

/** Zero-gamma level from full-chain profile (nearest crossing to spot). */
export function computeGammaFlip(
  points: GexStrikePoint[],
  stockPrice: number | null = null,
): number | null {
  const crossings = collectProfileCrossings(points);
  if (!crossings.length) return null;
  if (stockPrice == null || stockPrice <= 0) return crossings[0].strike;

  return crossings.reduce((best, crossing) =>
    Math.abs(crossing.strike - stockPrice) < Math.abs(best.strike - stockPrice)
      ? crossing
      : best,
  ).strike;
}

/** Deepest rising zero crossing below spot on the full strike profile. */
export function computeGammaFlipDeep(
  points: GexStrikePoint[],
  stockPrice: number | null,
): number | null {
  if (!points.length || stockPrice == null || stockPrice <= 0) return null;

  const crossings = collectProfileCrossings(points).filter(
    (crossing) =>
      crossing.rising &&
      crossing.strike <= stockPrice + 1e-6 &&
      isRelevantGammaFlip(crossing.strike, stockPrice),
  );
  if (!crossings.length) return null;
  return Math.min(...crossings.map((crossing) => crossing.strike));
}

export function pickDeepestSaneFlipBelowSpot(
  candidates: (number | null | undefined)[],
  stockPrice: number,
): number | null {
  const sane = candidates.filter(
    (flip): flip is number =>
      flip != null && isRelevantGammaFlip(flip, stockPrice) && flip <= stockPrice + 1e-6,
  );
  if (!sane.length) return null;
  return Math.min(...sane);
}

/** Interpolate cumulative gamma profile at an arbitrary strike. */
export function interpolateProfileAtStrike(
  points: GexStrikePoint[],
  strike: number,
): number | null {
  if (!points.length || !Number.isFinite(strike)) return null;
  const sorted = [...points].sort((a, b) => a.strike - b.strike);
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

export { isRelevantGammaFlip } from "@/lib/scoring/gex";

/** Cumulative gamma profile (OptionCharts-style) from the window start. */
export function buildCumulativeProfile(points: GexStrikePoint[]): GexStrikePoint[] {
  let cumulative = 0;
  return points.map((point) => {
    cumulative += point.netGex;
    return { ...point, profile: cumulative };
  });
}

/** Full-chain cumulative gamma profile rebased to zero at gamma flip. */
export function buildCumulativeProfileAtFlip(
  points: GexStrikePoint[],
  stockPrice: number | null,
  gammaFlip: number | null = null,
  profileSource?: GexStrikePoint[],
): GexStrikePoint[] {
  const window = filterStrikeWindow(points, stockPrice);
  if (!window.length) return [];
  if (gammaFlip == null) return rebaseProfileWindow(points, stockPrice);

  const sorted = [...(profileSource ?? points)].sort((a, b) => a.strike - b.strike);
  const rebased = buildLocalizedBarProfileAtFlip(
    sorted.map((point) => point.strike),
    sorted.map((point) => point.netGex),
    gammaFlip,
  );
  const rebasedSeries = sorted.map((point, index) => ({
    ...point,
    profile: rebased[index]?.profile ?? 0,
  }));
  const profileAt = (strike: number) => interpolateProfileAtStrike(rebasedSeries, strike) ?? 0;

  const windowStrikes = new Set(window.map((point) => point.strike));
  const chart = points
    .filter((point) => windowStrikes.has(point.strike))
    .map((point) => ({
      ...point,
      profile: profileAt(point.strike),
    }));

  const hasFlipStrike = chart.some((point) => Math.abs(point.strike - gammaFlip) < 1e-6);
  if (hasFlipStrike) return chart;

  const anchor: GexStrikePoint = {
    strike: gammaFlip,
    callGex: 0,
    putGex: 0,
    netGex: 0,
    profile: 0,
  };
  return [...chart, anchor].sort((a, b) => a.strike - b.strike);
}

/** Gamma profile anchored at zero on the flip strike (negative below, positive above). */
export function buildFlipAnchoredProfile(
  points: GexStrikePoint[],
  stockPrice: number | null,
  gammaFlip: number | null,
): GexStrikePoint[] {
  const window = filterStrikeWindow(points, stockPrice);
  if (!window.length) return [];
  if (gammaFlip == null) return rebaseProfileWindow(points, stockPrice);

  const sorted = [...window].sort((a, b) => a.strike - b.strike);
  const rebased = buildLocalizedBarProfileAtFlip(
    sorted.map((point) => point.strike),
    sorted.map((point) => point.netGex),
    gammaFlip,
  );
  const profileByStrike = new Map(rebased.map((point) => [point.x, point.profile]));
  const profiled = sorted.map((point) => ({
    ...point,
    profile: profileByStrike.get(point.strike) ?? 0,
  }));

  const hasFlipStrike = profiled.some((point) => Math.abs(point.strike - gammaFlip) < 1e-6);
  if (hasFlipStrike) return profiled;

  const anchor: GexStrikePoint = {
    strike: gammaFlip,
    callGex: 0,
    putGex: 0,
    netGex: 0,
    profile: 0,
  };
  return [...profiled, anchor].sort((a, b) => a.strike - b.strike);
}

export function prepareChartStrikeSeries(
  points: GexStrikePoint[],
  stockPrice: number | null,
  gammaFlip: number | null = null,
  profileSource?: GexStrikePoint[],
): GexStrikePoint[] {
  if (gammaFlip == null) return rebaseProfileWindow(points, stockPrice);
  return buildCumulativeProfileAtFlip(points, stockPrice, gammaFlip, profileSource);
}

function parseGexLevel(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Collect OI gamma flips from UW levels (primary + nearby). */
export function collectRelevantOiFlips(
  levels: UwGexLevels | null | undefined,
  stockPrice: number,
): number[] {
  const candidates = [levels?.gamma_flip, ...(levels?.nearby_flips ?? [])];
  return candidates
    .map(parseGexLevel)
    .filter(
      (flip): flip is number =>
        flip != null && isRelevantGammaFlip(flip, stockPrice) && flip <= stockPrice + 1e-6,
    );
}

function mergeGexLevels(
  primary: UwGexLevels | null | undefined,
  fallback: UwGexLevels | null | undefined,
): UwGexLevels | null {
  if (!primary && !fallback) return null;
  const nearby = [
    ...(primary?.nearby_flips ?? []),
    ...(fallback?.nearby_flips ?? []),
  ].filter(Boolean) as string[];
  return {
    call_wall: primary?.call_wall ?? fallback?.call_wall ?? null,
    put_wall: primary?.put_wall ?? fallback?.put_wall ?? null,
    gamma_flip: primary?.gamma_flip ?? fallback?.gamma_flip ?? null,
    gamma_magnet: primary?.gamma_magnet ?? fallback?.gamma_magnet ?? null,
    nearby_flips: nearby.length ? [...new Set(nearby)] : null,
  };
}

/** Chart gamma flip: deepest UW OI/vol flip below spot, with profile fallback. */
export function resolveChartGammaFlip(
  profileFlip: number | null,
  stockPrice: number,
  oiLevels?: UwGexLevels | null,
  volLevels?: UwGexLevels | null,
  extraOiFlip?: number | null,
  extraVolFlip?: number | null,
): number | null {
  if (stockPrice <= 0) return profileFlip;

  const oiFlips = [
    ...collectRelevantOiFlips(oiLevels, stockPrice),
    ...(extraOiFlip != null && isRelevantGammaFlip(extraOiFlip, stockPrice) ? [extraOiFlip] : []),
  ];
  const volFlips = collectRelevantOiFlips(volLevels, stockPrice);
  const levelFlips = [
    ...collectRelevantOiFlips(oiLevels, stockPrice),
    ...collectRelevantOiFlips(volLevels, stockPrice),
  ];
  const oiDeep = oiFlips.length ? Math.min(...oiFlips) : null;
  const volDeep = volFlips.length ? Math.min(...volFlips) : null;
  const levelDeep = levelFlips.length ? Math.min(...levelFlips) : null;
  const profile =
    profileFlip != null && isSaneGammaFlip(profileFlip, stockPrice) ? profileFlip : null;

  // MSFT-style: vol flip materially deeper than OI when both sit near spot.
  if (
    oiDeep != null &&
    volDeep != null &&
    volDeep < oiDeep &&
    (oiDeep - volDeep) / stockPrice > 0.05 &&
    profile != null &&
    Math.abs(profile - oiDeep) / stockPrice < 0.05
  ) {
    return volDeep;
  }

  // Prefer deepest UW level flip (OI + vol nearby) when profile sits above it.
  if (levelDeep != null) {
    if (profile == null || profile - levelDeep > stockPrice * 0.01) return levelDeep;
    if (profile < stockPrice * 0.75 && levelDeep > profile) return levelDeep;
  }

  // Prefer deepest OI flip from headline/extra OI when level flips are unavailable.
  if (oiDeep != null) {
    if (profile == null || profile - oiDeep > stockPrice * 0.01) return oiDeep;
    if (profile < stockPrice * 0.75 && oiDeep > profile) return oiDeep;
  }

  if (profile != null && volDeep != null && volDeep < profile) {
    if ((profile - volDeep) / stockPrice > 0.05) return volDeep;
  }
  if (
    profile != null &&
    extraVolFlip != null &&
    isRelevantGammaFlip(extraVolFlip, stockPrice) &&
    extraVolFlip < profile &&
    (profile - extraVolFlip) / stockPrice > 0.05
  ) {
    return extraVolFlip;
  }
  if (profile != null) return profile;
  if (levelDeep != null) return levelDeep;
  if (oiDeep != null) return oiDeep;
  if (volDeep != null) return volDeep;
  if (extraVolFlip != null && isRelevantGammaFlip(extraVolFlip, stockPrice)) return extraVolFlip;
  return null;
}

/** @deprecated Use resolveChartGammaFlip */
export function pickAllExpiryGammaFlip(
  profileFlip: number | null,
  oiFlip: number | null,
  volFlip: number | null,
  stockPrice: number,
  oiLevels?: UwGexLevels | null,
  volLevels?: UwGexLevels | null,
): number | null {
  return resolveChartGammaFlip(
    profileFlip,
    stockPrice,
    oiLevels,
    volLevels,
    oiFlip,
    volFlip,
  );
}

export function computeWallsFromSeries(
  points: GexStrikePoint[],
  stockPrice: number | null,
): { callWall: number | null; putWall: number | null; gammaMagnet: number | null } {
  return computeGexWallsFromSeries(points, stockPrice);
}

export function summarizeStrikeSeries(points: GexStrikePoint[]): {
  callGex: number;
  putGex: number;
  netGex: number;
} {
  let callGex = 0;
  let putGex = 0;
  for (const point of points) {
    callGex += point.callGex;
    putGex += point.putGex;
  }
  return { callGex, putGex, netGex: callGex + putGex };
}

function scaleStrikeSeries(points: GexStrikePoint[], factor: number): GexStrikePoint[] {
  if (!Number.isFinite(factor) || factor === 1) return points;
  let cumulative = 0;
  return points.map((point) => {
    const callGex = point.callGex * factor;
    const putGex = point.putGex * factor;
    const netGex = callGex + putGex;
    cumulative += netGex;
    return { ...point, callGex, putGex, netGex, profile: cumulative };
  });
}

function alignTotalsToNetGex(
  strikeTotals: { callGex: number; putGex: number; netGex: number },
  authoritativeNet: number,
): { callGex: number; putGex: number; netGex: number } {
  if (!Number.isFinite(authoritativeNet) || authoritativeNet === 0) return strikeTotals;
  if (strikeTotals.netGex === 0) return strikeTotals;

  const scale = authoritativeNet / strikeTotals.netGex;
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.05) {
    return { ...strikeTotals, netGex: authoritativeNet };
  }

  return {
    callGex: strikeTotals.callGex * scale,
    putGex: strikeTotals.putGex * scale,
    netGex: authoritativeNet,
  };
}

export function resolveStudyExpiry(
  expiries: UwGreekExposureExpiryRow[],
  requested: string | null,
  mode: GexExpiryMode = "weekly",
  now = new Date(),
): string {
  if (requested && requested !== "auto") return requested.slice(0, 10);
  const selected = selectExpiryRows(expiries, mode, now);
  if (!selected.length) return "all";
  const key = expiryKey(selected[0]);
  return key || "all";
}

function greekRowsNeedSpotScale(rows: UwSpotExposureStrikeRow[]): boolean {
  let sum = 0;
  let count = 0;
  for (const row of rows.slice(0, 40)) {
    const mag = Math.abs(parseNum(row.call_gamma_oi)) + Math.abs(parseNum(row.put_gamma_oi));
    if (mag > 0) {
      sum += mag;
      count += 1;
    }
  }
  if (!count) return false;
  return sum / count < 50_000;
}

function scaleGreekRowsToSpotGex(
  rows: UwSpotExposureStrikeRow[],
  stockPrice: number,
): UwSpotExposureStrikeRow[] {
  if (stockPrice <= 0) return rows;
  return rows.map((row) => ({
    ...row,
    call_gamma_oi: String(parseNum(row.call_gamma_oi) * stockPrice),
    put_gamma_oi: String(parseNum(row.put_gamma_oi) * stockPrice),
  }));
}

async function fetchSpotByStrike(
  client: UnusualWhalesClient,
  ticker: string,
  tradingDate: string,
  stockPrice: number | null,
): Promise<UwSpotExposureStrikeRow[]> {
  for (const date of [tradingDate, undefined]) {
    const rows: UwSpotExposureStrikeRow[] = [];
    for (let page = 0; page < 20; page++) {
      const res = (await client.spotExposureByStrike(ticker, {
        date,
        page,
        limit: 500,
      })) as UwDataResponse<UwSpotExposureStrikeRow[]>;
      const batch = res.data ?? [];
      if (!batch.length) break;
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    if (hasUsableSpotStrikes(rows)) return aggregateSpotRows(rows);
  }

  if (stockPrice != null && stockPrice > 0) {
    const minStrike = Math.max(0, stockPrice * 0.2);
    const maxStrike = stockPrice * 1.8;
    for (const date of [tradingDate, undefined]) {
      const windowRows: UwSpotExposureStrikeRow[] = [];
      for (let page = 0; page < 20; page++) {
        const res = (await client.spotExposureByStrike(ticker, {
          date,
          minStrike,
          maxStrike,
          page,
          limit: 500,
        })) as UwDataResponse<UwSpotExposureStrikeRow[]>;
        const batch = res.data ?? [];
        if (!batch.length) break;
        windowRows.push(...batch);
        if (batch.length < 500) break;
      }
      if (hasUsableSpotStrikes(windowRows)) return aggregateSpotRows(windowRows);
    }
  }

  return [];
}

async function fetchSpotByExpiryAggregation(
  client: UnusualWhalesClient,
  ticker: string,
  expiries: string[],
  tradingDate: string,
): Promise<UwSpotExposureStrikeRow[]> {
  if (!expiries.length) return [];

  const rows: UwSpotExposureStrikeRow[] = [];
  for (const batch of chunk(expiries, 12)) {
    for (let page = 0; page < 10; page++) {
      const res = (await client.spotExposureByExpiryStrike(ticker, batch, {
        date: tradingDate,
        page,
        limit: 500,
      })) as UwDataResponse<UwSpotExposureStrikeRow[]>;
      const pageRows = res.data ?? [];
      if (!pageRows.length) break;
      rows.push(...pageRows);
      if (pageRows.length < 500) break;
    }
  }

  const aggregated = aggregateSpotRows(rows);
  return hasUsableSpotStrikes(aggregated) ? aggregated : [];
}

async function fetchAllSpotExposures(
  client: UnusualWhalesClient,
  ticker: string,
  options: {
    expiry?: string;
    tradingDate: string;
    expiries: string[];
    stockPrice: number | null;
  },
): Promise<UwSpotExposureStrikeRow[]> {
  const { expiry, tradingDate, expiries, stockPrice } = options;

  if (expiry) {
    const rows: UwSpotExposureStrikeRow[] = [];
    for (let page = 0; page < 10; page++) {
      const res = (await client.spotExposureByExpiryStrike(ticker, [expiry], {
        date: tradingDate,
        page,
        limit: 500,
      })) as UwDataResponse<UwSpotExposureStrikeRow[]>;
      const batch = res.data ?? [];
      if (!batch.length) break;
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    const aggregated = aggregateSpotRows(rows);
    return hasUsableSpotStrikes(aggregated) ? aggregated : [];
  }

  const byStrike = await fetchSpotByStrike(client, ticker, tradingDate, stockPrice);
  if (byStrike.length) return byStrike;

  return fetchSpotByExpiryAggregation(client, ticker, expiries, tradingDate);
}

async function fetchGreekStrikeRows(
  client: UnusualWhalesClient,
  ticker: string,
  expiry: string | undefined,
): Promise<UwSpotExposureStrikeRow[]> {
  const greekRes = expiry
    ? ((await client.greekExposureByStrikeExpiry(
        ticker,
        expiry,
      )) as UwDataResponse<UwGreekExposureStrikeRow[]>)
    : ((await client.greekExposureByStrike(ticker)) as UwDataResponse<
        UwGreekExposureStrikeRow[]
      >);

  return (greekRes.data ?? []).map((row) => ({
    strike: row.strike,
    call_gamma_oi: row.call_gex,
    put_gamma_oi: row.put_gex,
  }));
}

async function fetchStrikeRowsWithFallback(
  client: UnusualWhalesClient,
  ticker: string,
  expiry: string | undefined,
  options: {
    tradingDate: string;
    expiries: string[];
    stockPrice: number | null;
  },
): Promise<{ rows: UwSpotExposureStrikeRow[]; source: "spot" | "greek" }> {
  const spotRows = await fetchAllSpotExposures(client, ticker, {
    expiry,
    tradingDate: options.tradingDate,
    expiries: options.expiries,
    stockPrice: options.stockPrice,
  });
  if (hasUsableSpotStrikes(spotRows)) return { rows: spotRows, source: "spot" };

  const greekRows = await fetchGreekStrikeRows(client, ticker, expiry);
  if (hasUsableSpotStrikes(greekRows)) return { rows: greekRows, source: "greek" };

  return { rows: [], source: "greek" };
}

function latestSpotSnapshot(
  snapshots: UwSpotExposureSnapshot[] | undefined,
): UwSpotExposureSnapshot | null {
  if (!snapshots?.length) return null;
  return snapshots.reduce((latest, row) => {
    if (!latest) return row;
    const latestTime = Date.parse(latest.time);
    const rowTime = Date.parse(row.time);
    if (Number.isNaN(latestTime) || Number.isNaN(rowTime)) return row;
    return rowTime >= latestTime ? row : latest;
  });
}

function latestSpotNetGex(
  snapshots: UwSpotExposureSnapshot[] | undefined,
): number | null {
  const latest = latestSpotSnapshot(snapshots);
  if (!latest?.gamma_per_one_percent_move_oi) return null;
  const net = parseFloat(latest.gamma_per_one_percent_move_oi);
  return Number.isNaN(net) ? null : net;
}

function normalizeIv(raw: number): number {
  if (raw <= 0) return 0;
  return raw > 3 ? raw / 100 : raw;
}

/** Parse OSI option symbol into strike, type, and expiry. */
export function parseOsiOptionSymbol(symbol: string): {
  type: "C" | "P";
  strike: number;
  expiry: string;
} | null {
  const match = symbol.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return null;
  const [, , yy, mm, dd, cp, strikeRaw] = match;
  return {
    type: cp === "P" ? "P" : "C",
    strike: parseInt(strikeRaw, 10) / 1000,
    expiry: `20${yy}-${mm}-${dd}`,
  };
}

/** Map UW option-chain rows into simulation legs (OI > 0). */
export function parseOptionChainLegs(
  rows: (UwOptionChainRow | string)[],
  expiryFilter?: string,
  dteByExpiry?: Map<string, number>,
): OptionChainLeg[] {
  const legs: OptionChainLeg[] = [];

  for (const row of rows) {
    if (typeof row === "string") {
      continue;
    }

    const symbol = row.option_symbol ?? row.symbol;
    const parsedFromSymbol =
      typeof symbol === "string" ? parseOsiOptionSymbol(symbol) : null;

    const strike =
      parseNum(String(row.strike ?? "")) || parsedFromSymbol?.strike || 0;
    const oi = parseNum(String(row.open_interest ?? row.oi ?? ""));
    if (strike <= 0 || oi <= 0) continue;

    const expiry = (row.expiry ?? parsedFromSymbol?.expiry ?? "").slice(0, 10);
    if (expiryFilter && expiryFilter !== "all" && expiry && expiry !== expiryFilter) {
      continue;
    }

    const typeRaw = (row.type ?? row.option_type ?? parsedFromSymbol?.type ?? "C")
      .toString()
      .toUpperCase();
    const type: "C" | "P" = typeRaw.startsWith("P") ? "P" : "C";
    const iv = normalizeIv(
      parseNum(String(row.iv ?? row.implied_volatility ?? row.volatility ?? "")),
    );
    const dteFromMap = expiry ? dteByExpiry?.get(expiry) : undefined;
    const dte = dteFromMap ?? row.dte ?? 0;

    legs.push({ strike, type, oi, iv, expiry, dte });
  }

  return legs;
}

/** Map paginated option-contract rows into per-contract simulation legs. */
export function parseOptionContractRows(
  rows: UwOptionContractRow[],
  expiryFilter?: string,
  dteByExpiry?: Map<string, number>,
): OptionChainLeg[] {
  const legs: OptionChainLeg[] = [];

  for (const row of rows) {
    const parsed = parseOsiOptionSymbol(row.option_symbol ?? "");
    const oi = parseNum(String(row.open_interest ?? ""));
    if (oi <= 0) continue;

    const strike = parseNum(String(row.strike ?? "")) || parsed?.strike || 0;
    const expiry = (row.expiry ?? parsed?.expiry ?? "").slice(0, 10);
    const type = parsed?.type ?? "C";
    if (strike <= 0 || !expiry) continue;

    if (expiryFilter && expiryFilter !== "all" && expiry !== expiryFilter) {
      continue;
    }

    const iv = normalizeIv(parseNum(String(row.implied_volatility ?? "")));
    const dte = dteByExpiry?.get(expiry) ?? 0;
    legs.push({ strike, type, oi, iv, expiry, dte });
  }

  return legs;
}

const MIN_CHAIN_LEGS = 4;
const TARGET_CHAIN_LEGS = 100;
const MAX_PARALLEL_EXPIRIES = 16;
const MAX_PAGES_PER_EXPIRY = 8;
const MAX_UNFILTERED_PAGES = 12;

async function fetchContractsForExpiry(
  client: UnusualWhalesClient,
  ticker: string,
  tradingDate: string | undefined,
  expiry: string,
  dteByExpiry: Map<string, number>,
): Promise<OptionChainLeg[]> {
  const legs: OptionChainLeg[] = [];
  for (let page = 0; page < MAX_PAGES_PER_EXPIRY; page++) {
    const res = (await client.optionContracts(ticker, {
      date: tradingDate,
      expiry,
      excludeZeroOiChains: true,
      page,
      limit: 500,
    })) as UwDataResponse<UwOptionContractRow[]>;
    const batch = res.data ?? [];
    if (!batch.length) break;
    legs.push(...parseOptionContractRows(batch, expiry, dteByExpiry));
    if (batch.length < 500) break;
  }
  return legs;
}

async function fetchOptionContractsPaginated(
  client: UnusualWhalesClient,
  ticker: string,
  tradingDate: string,
  expiryFilter: string | undefined,
  dteByExpiry: Map<string, number>,
): Promise<OptionChainLeg[]> {
  // Prefer front/intermediate expiries (≤120 DTE); drop LEAPs from "all" aggregation.
  const expiries = [...dteByExpiry.entries()]
    .filter(([, dte]) => dte <= MAX_GEX_PROFILE_DTE)
    .sort(([, aDte], [, bDte]) => aDte - bDte)
    .map(([expiry]) => expiry)
    .filter(Boolean);

  if (expiryFilter && expiryFilter !== "all") {
    for (const date of [tradingDate, undefined]) {
      const legs = await fetchContractsForExpiry(
        client,
        ticker,
        date,
        expiryFilter,
        dteByExpiry,
      );
      const deduped = dedupeChainLegs(legs);
      if (deduped.length >= MIN_CHAIN_LEGS) return deduped;
    }
  } else if (expiries.length) {
    for (const date of [tradingDate, undefined]) {
      const selected = expiries.slice(0, MAX_PARALLEL_EXPIRIES);
      const batches = await Promise.all(
        selected.map((expiry) =>
          fetchContractsForExpiry(client, ticker, date, expiry, dteByExpiry),
        ),
      );
      const deduped = dedupeChainLegs(batches.flat());
      if (deduped.length >= TARGET_CHAIN_LEGS) return deduped;
      if (deduped.length >= MIN_CHAIN_LEGS) return deduped;
    }
  }

  for (const date of [tradingDate, undefined]) {
    const legs: OptionChainLeg[] = [];
    for (let page = 0; page < MAX_UNFILTERED_PAGES; page++) {
      const res = (await client.optionContracts(ticker, {
        date,
        expiry: expiryFilter && expiryFilter !== "all" ? expiryFilter : undefined,
        excludeZeroOiChains: true,
        page,
        limit: 500,
      })) as UwDataResponse<UwOptionContractRow[]>;
      const batch = res.data ?? [];
      if (!batch.length) break;
      legs.push(...parseOptionContractRows(batch, expiryFilter, dteByExpiry));
      if (batch.length < 500) break;
      if (dedupeChainLegs(legs).length >= TARGET_CHAIN_LEGS) break;
    }
    const deduped = dedupeChainLegs(legs);
    if (deduped.length >= MIN_CHAIN_LEGS) return deduped;
  }

  return [];
}

async function fetchOptionChainLegs(
  client: UnusualWhalesClient,
  ticker: string,
  tradingDate: string,
  expiryFilter: string | undefined,
  expiryRows: UwGreekExposureExpiryRow[],
): Promise<OptionChainLeg[]> {
  const singleExpiry = Boolean(expiryFilter && expiryFilter !== "all");
  const scopedRows = singleExpiry
    ? expiryRows
    : expiryRows.filter((row) => row.dte <= MAX_GEX_PROFILE_DTE);

  const dteByExpiry = new Map(
    scopedRows.map((row) => [expiryKey(row), row.dte] as const).filter(([key]) => Boolean(key)),
  );

  const contractLegs = await fetchOptionContractsPaginated(
    client,
    ticker,
    tradingDate,
    expiryFilter,
    dteByExpiry,
  );
  const scopedContracts = singleExpiry
    ? contractLegs
    : filterLegsByMaxDte(contractLegs, MAX_GEX_PROFILE_DTE, tradingDate);
  if (scopedContracts.length >= TARGET_CHAIN_LEGS) return scopedContracts;

  try {
    const res = (await client.optionChains(ticker, {
      date: tradingDate,
      greeks: true,
    })) as UwDataResponse<(UwOptionChainRow | string)[]>;
    const chainLegs = parseOptionChainLegs(res.data ?? [], expiryFilter, dteByExpiry);
    const merged = dedupeChainLegs([...scopedContracts, ...chainLegs]);
    const scoped = singleExpiry
      ? merged
      : filterLegsByMaxDte(merged, MAX_GEX_PROFILE_DTE, tradingDate);
    const withOi = scoped.filter((leg) => leg.oi > 0);
    if (withOi.length >= MIN_CHAIN_LEGS) return withOi;
    if (scoped.length >= MIN_CHAIN_LEGS) return scoped;
  } catch {
    // fall through to contract legs
  }

  return scopedContracts;
}

function buildBarRebasedProfile(
  bars: GexStrikePoint[],
  stockPrice: number | null,
  gammaFlip: number | null,
  profileSource?: GexStrikePoint[],
): GexStrikePoint[] {
  return buildCumulativeProfileAtFlip(bars, stockPrice, gammaFlip, profileSource ?? bars);
}

export function buildSimulatedChartStrikes(
  bars: GexStrikePoint[],
  legs: OptionChainLeg[],
  stockPrice: number,
  tradingDate: string,
  gammaFlip: number | null,
  _profileSource: GexStrikePoint[],
): { strikes: GexStrikePoint[]; simulatedFlip: number | null; usedSimulation: boolean } {
  const raw = simulateRawNetGexProfile(legs, stockPrice, {
    asOfDate: tradingDate,
    steps: 250,
  });
  if (!raw.length) return { strikes: bars, simulatedFlip: null, usedSimulation: false };

  const simulatedFlip = gammaFlipFromRawProfile(raw, stockPrice);
  const anchorFlip = gammaFlip ?? simulatedFlip;
  if (anchorFlip == null) return { strikes: bars, simulatedFlip, usedSimulation: false };

  const windowed = filterStrikeWindow(bars, stockPrice);
  if (!windowed.length) return { strikes: bars, simulatedFlip, usedSimulation: false };

  const minStrike = windowed[0].strike;
  const maxStrike = windowed[windowed.length - 1].strike;
  const windowProfile = buildChainSimulatedGammaProfile(
    legs,
    stockPrice,
    anchorFlip,
    { asOfDate: tradingDate, steps: 250 },
  ).filter(
    (point) => point.simulatedSpot >= minStrike && point.simulatedSpot <= maxStrike,
  );

  const strikes = mergeSimulatedProfileOntoBars(windowed, windowProfile, anchorFlip);
  return { strikes, simulatedFlip, usedSimulation: true };
}

export async function fetchGexStudy(
  client: UnusualWhalesClient,
  ticker: string,
  expiry: string,
): Promise<GexStudyResult> {
  const useAll = expiry === "all";

  const ohlcRes = (await client.ohlc(ticker, "1d", 1)) as UwDataResponse<UwCandle[]>;
  const stockPrice = latestClose(ohlcRes.data ?? []);
  const tradingDate = resolveTradingDate(ohlcRes.data ?? []);

  const [exposureRes, levelsOiRes, levelsVolRes, spotTotalsRes] = await Promise.all([
    client.greekExposureByExpiry(ticker) as Promise<UwDataResponse<UwGreekExposureExpiryRow[]>>,
    client.gexLevels(ticker, "oi", tradingDate) as Promise<UwDataResponse<UwGexLevels>>,
    client.gexLevels(ticker, "vol", tradingDate) as Promise<UwDataResponse<UwGexLevels>>,
    useAll
      ? (client.spotExposures(ticker) as Promise<UwDataResponse<UwSpotExposureSnapshot[]>>)
      : Promise.resolve(null),
  ]);

  const [levelsOiFallback, levelsVolFallback] = await Promise.all([
    levelsOiRes?.data?.nearby_flips?.length
      ? Promise.resolve(null)
      : (client.gexLevels(ticker, "oi") as Promise<UwDataResponse<UwGexLevels>>),
    levelsVolRes?.data?.nearby_flips?.length
      ? Promise.resolve(null)
      : (client.gexLevels(ticker, "vol") as Promise<UwDataResponse<UwGexLevels>>),
  ]);
  const mergedOiLevels = mergeGexLevels(levelsOiRes?.data, levelsOiFallback?.data);
  const mergedVolLevels = mergeGexLevels(levelsVolRes?.data, levelsVolFallback?.data);
  const expiryRowsAll = exposureRes.data ?? [];
  const expiryRowsForMath = useAll
    ? expiryRowsAll.filter((row) => row.dte <= MAX_GEX_PROFILE_DTE)
    : expiryRowsAll;
  const expiries = expiryRowsForMath.map((row) => expiryKey(row)).filter(Boolean);

  let spotTotalsData = spotTotalsRes?.data;
  if (useAll) {
    const datedSpotTotals = (await client.spotExposures(
      ticker,
      tradingDate,
    )) as UwDataResponse<UwSpotExposureSnapshot[]>;
    if (datedSpotTotals.data?.length) {
      spotTotalsData = datedSpotTotals.data;
    }
  }

  const strikePayload = await fetchStrikeRowsWithFallback(
    client,
    ticker,
    useAll ? undefined : expiry,
    { tradingDate, expiries, stockPrice },
  );

  let strikeRows = strikePayload.rows;
  if (strikePayload.source === "greek" && stockPrice != null && stockPrice > 0) {
    if (greekRowsNeedSpotScale(strikeRows)) {
      strikeRows = scaleGreekRowsToSpotGex(strikeRows, stockPrice);
    }
  }

  const expiryRows = expiryRowsAll;
  const chainLegs = await fetchOptionChainLegs(
    client,
    ticker,
    tradingDate,
    useAll ? undefined : expiry,
    expiryRowsForMath,
  );
  const availableExpiries = expiryRows
    .map((row) => ({ expiry: expiryKey(row), dte: row.dte }))
    .filter((row) => row.expiry)
    .sort((a, b) => a.dte - b.dte);

  let flipSeries = buildFlipSeries(strikeRows, stockPrice);
  let profileStrikeSeries = buildProfileSourceSeries(strikeRows);
  let fullSeries = buildStrikeSeries(strikeRows, stockPrice);
  let totals = summarizeStrikeSeries(fullSeries);

  const authoritativeNet = useAll ? latestSpotNetGex(spotTotalsData) : null;
  if (authoritativeNet != null) {
    totals = alignTotalsToNetGex(totals, authoritativeNet);
    if (totals.netGex !== 0 && fullSeries.length) {
      const strikeNet = summarizeStrikeSeries(fullSeries).netGex;
      if (strikeNet !== 0) {
        const factor = totals.netGex / strikeNet;
        fullSeries = scaleStrikeSeries(fullSeries, factor);
        flipSeries = scaleStrikeSeries(flipSeries, factor);
        profileStrikeSeries = scaleStrikeSeries(profileStrikeSeries, factor);
      }
    }
  } else if (strikePayload.source === "greek" && stockPrice != null && stockPrice > 0) {
    totals = summarizeStrikeSeries(fullSeries);
  }

  const profileFlipFromBars =
    computeGammaFlipDeep(profileStrikeSeries, stockPrice) ??
    computeGammaFlipFromWindow(profileStrikeSeries, stockPrice);

  let simulatedFlip: number | null = null;
  if (chainLegs.length >= MIN_CHAIN_LEGS && stockPrice != null && stockPrice > 0) {
    const raw = simulateRawNetGexProfile(chainLegs, stockPrice, { asOfDate: tradingDate });
    simulatedFlip = gammaFlipFromRawProfile(raw, stockPrice);
  }

  const profileFlip = simulatedFlip ?? profileFlipFromBars;
  const levels = mergedOiLevels
    ? computeGexLevelsFromUw(mergedOiLevels, stockPrice ?? 0)
    : null;

  // Never seed walls from UW OI levels — those are open-interest peaks, not dollar GEX.
  let callWallStrike: number | null = null;
  let putWallStrike: number | null = null;
  let gammaMagnet: number | null = levels?.gammaMagnet ?? null;
  const spot = stockPrice ?? 0;
  const saneProfileFlip =
    profileFlip != null && spot > 0 && isSaneGammaFlip(profileFlip, spot) ? profileFlip : null;

  let gammaFlip = resolveChartGammaFlip(
    saneProfileFlip,
    spot,
    mergedOiLevels,
    mergedVolLevels,
  );

  if (gammaFlip != null && spot > 0 && !isSaneGammaFlip(gammaFlip, spot)) {
    gammaFlip = null;
  }

  let chartStrikes: GexStrikePoint[] | null = null;
  let profileSource: GexStudyResult["profileSource"] = "bars";
  if (chainLegs.length >= MIN_CHAIN_LEGS && stockPrice != null && stockPrice > 0) {
    const simulated = buildSimulatedChartStrikes(
      fullSeries,
      chainLegs,
      stockPrice,
      tradingDate,
      gammaFlip,
      profileStrikeSeries,
    );
    chartStrikes = simulated.strikes;
    simulatedFlip = simulated.simulatedFlip ?? simulatedFlip;
    if (simulated.usedSimulation) profileSource = "simulated";
  }

  // Walls from the same dollar-GEX strike series shown on the chart (never OI).
  const wallSeries = chartStrikes ?? fullSeries;
  const walls = computeWallsFromSeries(wallSeries, stockPrice);
  callWallStrike = walls.callWall;
  putWallStrike = walls.putWall;
  gammaMagnet = walls.gammaMagnet ?? gammaMagnet;

  let regime: GexStudyResult["regime"] = "neutral";
  let flipDistancePct: number | null = null;
  if (gammaFlip != null && stockPrice != null && stockPrice > 0) {
    regime = stockPrice >= gammaFlip ? "positive" : "negative";
    flipDistancePct = ((stockPrice - gammaFlip) / stockPrice) * 100;
  }

  return {
    ticker,
    expiry,
    scannedAt: new Date().toISOString(),
    stockPrice,
    callWall: callWallStrike,
    putWall: putWallStrike,
    gammaFlip,
    gammaMagnet,
    netGex: totals.netGex,
    callGex: totals.callGex,
    putGex: totals.putGex,
    regime,
    flipDistancePct,
    strikes:
      chartStrikes ?? buildBarRebasedProfile(fullSeries, stockPrice, gammaFlip, profileStrikeSeries),
    availableExpiries,
    profileSource,
    chainLegCount: chainLegs.filter((leg) => leg.oi > 0).length,
  };
}
