import type { UnusualWhalesClient } from "@/lib/unusualwhales/client";
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

/** OptionCharts-style cumulative gamma profile for chart display (no rebase). */
export function buildChartCumulativeProfile(
  points: GexStrikePoint[],
  stockPrice: number | null,
  profileSource?: GexStrikePoint[],
): GexStrikePoint[] {
  const window = filterStrikeWindow(points, stockPrice);
  if (!window.length) return [];

  const sorted = [...(profileSource ?? points)].sort((a, b) => a.strike - b.strike);
  const fullCumulative = buildCumulativeProfile(sorted);
  const windowStrikes = new Set(window.map((point) => point.strike));

  return points
    .filter((point) => windowStrikes.has(point.strike))
    .map((point) => ({
      ...point,
      profile: interpolateProfileAtStrike(fullCumulative, point.strike) ?? 0,
    }));
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
  const fullCumulative = buildCumulativeProfile(sorted);
  const atFlip = interpolateProfileAtStrike(fullCumulative, gammaFlip) ?? 0;
  const profileAt = (strike: number) =>
    (interpolateProfileAtStrike(fullCumulative, strike) ?? 0) - atFlip;

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
  const profiled = sorted.map((point) => {
    let profile = 0;
    if (point.strike >= gammaFlip) {
      for (const row of sorted) {
        if (row.strike > gammaFlip && row.strike <= point.strike) profile += row.netGex;
      }
    } else {
      for (const row of sorted) {
        if (row.strike >= point.strike && row.strike < gammaFlip) profile += row.netGex;
      }
    }
    return { ...point, profile };
  });

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
  return buildChartCumulativeProfile(points, stockPrice, profileSource);
}

/** All-expiry flip: profile when reliable, OI gamma_flip, deeper vol flip for MSFT-style. */
export function pickAllExpiryGammaFlip(
  profileFlip: number | null,
  oiFlip: number | null,
  volFlip: number | null,
  stockPrice: number,
): number | null {
  const relevant = (flip: number | null | undefined): number | null =>
    flip != null && stockPrice > 0 && isRelevantGammaFlip(flip, stockPrice) && flip <= stockPrice + 1e-6
      ? flip
      : null;

  const profile = relevant(profileFlip);
  const oi = relevant(oiFlip);
  const vol = relevant(volFlip);

  if (profile && oi) {
    if (profile < stockPrice * 0.75 && oi > profile) return oi;
    const nearest = Math.min(profile, oi);
    if (vol && vol < nearest && (nearest - vol) / stockPrice > 0.05) return vol;
    return nearest;
  }
  if (profile && vol && vol < profile) return vol;
  if (profile) return profile;
  if (oi) return oi;
  if (vol) return vol;
  return null;
}

export function computeWallsFromSeries(
  points: GexStrikePoint[],
  stockPrice: number | null,
): { callWall: number | null; putWall: number | null; gammaMagnet: number | null } {
  if (!points.length) {
    return { callWall: null, putWall: null, gammaMagnet: null };
  }

  let callWall: number | null = null;
  let callMax = -Infinity;
  let putWall: number | null = null;
  let putMax = -Infinity;
  let gammaMagnet: number | null = null;
  let magnetAbs = -Infinity;

  for (const point of points) {
    const absNet = Math.abs(point.netGex);
    if (absNet > magnetAbs) {
      magnetAbs = absNet;
      gammaMagnet = point.strike;
    }

    if (stockPrice != null && stockPrice > 0) {
      if (point.strike > stockPrice && point.netGex > callMax) {
        callMax = point.netGex;
        callWall = point.strike;
      }
      if (point.strike < stockPrice && point.netGex > putMax) {
        putMax = point.netGex;
        putWall = point.strike;
      }
    }
  }

  if (stockPrice == null) {
    const byNet = [...points].sort((a, b) => b.netGex - a.netGex);
    callWall = byNet[0]?.strike ?? null;
    putWall = byNet[byNet.length - 1]?.strike ?? null;
  }

  return { callWall, putWall, gammaMagnet };
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

  const greekRes = expiry
    ? ((await client.greekExposureByStrikeExpiry(
        ticker,
        expiry,
      )) as UwDataResponse<UwGreekExposureStrikeRow[]>)
    : ((await client.greekExposureByStrike(ticker)) as UwDataResponse<
        UwGreekExposureStrikeRow[]
      >);

  return {
    rows: (greekRes.data ?? []).map((row) => ({
      strike: row.strike,
      call_gamma_oi: row.call_gex,
      put_gamma_oi: row.put_gex,
    })),
    source: "greek",
  };
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
    useAll
      ? (client.gexLevels(ticker, "vol", tradingDate) as Promise<UwDataResponse<UwGexLevels>>)
      : Promise.resolve(null),
    useAll
      ? (client.spotExposures(ticker) as Promise<UwDataResponse<UwSpotExposureSnapshot[]>>)
      : Promise.resolve(null),
  ]);
  const expiries = (exposureRes.data ?? [])
    .map((row) => expiryKey(row))
    .filter(Boolean);

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
    strikeRows = scaleGreekRowsToSpotGex(strikeRows, stockPrice);
  }

  const expiryRows = exposureRes.data ?? [];
  const availableExpiries = expiryRows
    .map((row) => ({ expiry: expiryKey(row), dte: row.dte }))
    .filter((row) => row.expiry)
    .sort((a, b) => a.dte - b.dte);

  let flipSeries = buildFlipSeries(strikeRows, stockPrice);
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
      }
    }
  } else if (strikePayload.source === "greek" && stockPrice != null && stockPrice > 0) {
    totals = summarizeStrikeSeries(fullSeries);
  }

  const profileFlip =
    computeGammaFlipDeep(flipSeries, stockPrice) ??
    computeGammaFlipFromWindow(flipSeries, stockPrice);
  const oiFlip = resolveGammaFlip(levelsOiRes?.data, stockPrice ?? 0, null);
  const volFlip = useAll ? resolveGammaFlip(levelsVolRes?.data, stockPrice ?? 0, null) : null;
  const levels = levelsOiRes?.data
    ? computeGexLevelsFromUw(levelsOiRes.data, stockPrice ?? 0)
    : null;

  let callWall = levels?.callWall ?? null;
  let putWall = levels?.putWall ?? null;
  let gammaMagnet = levels?.gammaMagnet ?? null;
  const spot = stockPrice ?? 0;
  const saneProfileFlip =
    profileFlip != null && spot > 0 && isSaneGammaFlip(profileFlip, spot) ? profileFlip : null;
  const saneOiFlip =
    oiFlip != null && spot > 0 && isRelevantGammaFlip(oiFlip, spot) ? oiFlip : null;
  const saneVolFlip =
    volFlip != null && spot > 0 && isRelevantGammaFlip(volFlip, spot) ? volFlip : null;

  let gammaFlip = useAll
    ? pickAllExpiryGammaFlip(saneProfileFlip, saneOiFlip, saneVolFlip, spot)
    : (saneProfileFlip ?? computeGammaFlip(fullSeries, stockPrice));

  if (gammaFlip != null && spot > 0 && !isSaneGammaFlip(gammaFlip, spot)) {
    gammaFlip = null;
  }

  if (!useAll) {
    const walls = computeWallsFromSeries(fullSeries, stockPrice);
    callWall = walls.callWall;
    putWall = walls.putWall;
    gammaMagnet = walls.gammaMagnet;
  }

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
    callWall,
    putWall,
    gammaFlip,
    gammaMagnet,
    netGex: totals.netGex,
    callGex: totals.callGex,
    putGex: totals.putGex,
    regime,
    flipDistancePct,
    strikes: prepareChartStrikeSeries(fullSeries, stockPrice, gammaFlip, flipSeries),
    availableExpiries,
  };
}
