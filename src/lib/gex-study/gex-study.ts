import type { UnusualWhalesClient } from "@/lib/unusualwhales/client";
import { computeGexLevelsFromUw, isSaneGammaFlip, resolveGammaFlip } from "@/lib/scoring/gex";
import { expiryKey, selectExpiryRows } from "@/lib/gex-scan/gex-scan";
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

function readSpotStrikeGex(row: UwSpotExposureStrikeRow): { callGex: number; putGex: number } {
  const callGex = parseNum(row.call_gamma_oi ?? (row as UwGreekExposureStrikeRow).call_gex);
  const putGex = parseNum(row.put_gamma_oi ?? (row as UwGreekExposureStrikeRow).put_gex);
  return { callGex, putGex };
}

export function buildStrikeSeries(
  rows: UwSpotExposureStrikeRow[],
  stockPrice: number | null = null,
): GexStrikePoint[] {
  const minStrike =
    stockPrice != null && stockPrice > 0 ? stockPrice * 0.15 : 0;

  const sorted = [...rows]
    .map((row) => {
      const strike = parseNum(row.strike);
      const { callGex, putGex } = readSpotStrikeGex(row);
      return { strike, callGex, putGex, netGex: callGex + putGex, profile: 0 };
    })
    .filter((row) => row.strike >= minStrike)
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

/** Recompute cumulative profile from zero at the window start (drops deep-OTM history). */
export function rebaseProfileWindow(
  points: GexStrikePoint[],
  stockPrice: number | null,
): GexStrikePoint[] {
  const window = filterStrikeWindow(points, stockPrice);
  let cumulative = 0;
  return window.map((point) => {
    cumulative += point.netGex;
    return { ...point, profile: cumulative };
  });
}

/** Rising zero crossing below spot inside the near-ATM strike window. */
export function computeGammaFlipFromWindow(
  points: GexStrikePoint[],
  stockPrice: number | null,
): number | null {
  if (!points.length || stockPrice == null || stockPrice <= 0) return null;

  const window = rebaseProfileWindow(points, stockPrice);
  const minStrike = stockPrice * 0.45;

  for (let i = window.length - 1; i >= 1; i--) {
    const prev = window[i - 1];
    const curr = window[i];
    if (curr.strike > stockPrice || prev.strike < minStrike) continue;
    if (prev.profile <= 0 && curr.profile >= 0) {
      return interpolateRisingCrossing(prev, curr);
    }
  }

  const crossings = collectProfileCrossings(window).filter(
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

async function fetchAllSpotExposures(
  client: UnusualWhalesClient,
  ticker: string,
  expiry?: string,
): Promise<UwSpotExposureStrikeRow[]> {
  if (expiry) {
    const res = (await client.spotExposureByExpiryStrike(ticker, [
      expiry,
    ])) as UwDataResponse<UwSpotExposureStrikeRow[]>;
    return res.data ?? [];
  }

  const rows: UwSpotExposureStrikeRow[] = [];
  for (let page = 0; page < 20; page++) {
    const res = (await client.spotExposureByStrike(ticker, {
      page,
      limit: 500,
    })) as UwDataResponse<UwSpotExposureStrikeRow[]>;
    const batch = res.data ?? [];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

async function fetchStrikeRowsWithFallback(
  client: UnusualWhalesClient,
  ticker: string,
  expiry?: string,
): Promise<{ rows: UwSpotExposureStrikeRow[]; source: "spot" | "greek" }> {
  const spotRows = await fetchAllSpotExposures(client, ticker, expiry);
  if (spotRows.length) return { rows: spotRows, source: "spot" };

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

  const [exposureRes, ohlcRes, strikePayload, levelsRes, spotTotalsRes] = await Promise.all([
    client.greekExposureByExpiry(ticker) as Promise<UwDataResponse<UwGreekExposureExpiryRow[]>>,
    client.ohlc(ticker, "1d", 1) as Promise<UwDataResponse<UwCandle[]>>,
    fetchStrikeRowsWithFallback(client, ticker, useAll ? undefined : expiry),
    client.gexLevels(ticker, "oi") as Promise<UwDataResponse<UwGexLevels>>,
    useAll
      ? (client.spotExposures(ticker) as Promise<UwDataResponse<UwSpotExposureSnapshot[]>>)
      : Promise.resolve(null),
  ]);

  const stockPrice = latestClose(ohlcRes.data ?? []);

  let strikeRows = strikePayload.rows;
  if (strikePayload.source === "greek" && stockPrice != null && stockPrice > 0) {
    strikeRows = scaleGreekRowsToSpotGex(strikeRows, stockPrice);
  }

  const expiryRows = exposureRes.data ?? [];
  const availableExpiries = expiryRows
    .map((row) => ({ expiry: expiryKey(row), dte: row.dte }))
    .filter((row) => row.expiry)
    .sort((a, b) => a.dte - b.dte);

  let fullSeries = buildStrikeSeries(strikeRows, stockPrice);
  let totals = summarizeStrikeSeries(fullSeries);

  const authoritativeNet = useAll ? latestSpotNetGex(spotTotalsRes?.data) : null;
  if (authoritativeNet != null) {
    totals = alignTotalsToNetGex(totals, authoritativeNet);
    if (totals.netGex !== 0 && fullSeries.length) {
      const strikeNet = summarizeStrikeSeries(fullSeries).netGex;
      if (strikeNet !== 0) {
        fullSeries = scaleStrikeSeries(fullSeries, totals.netGex / strikeNet);
      }
    }
  } else if (strikePayload.source === "greek" && stockPrice != null && stockPrice > 0) {
    totals = summarizeStrikeSeries(fullSeries);
  }

  const profileFlip = computeGammaFlipFromWindow(fullSeries, stockPrice);
  const levelsFlip = resolveGammaFlip(levelsRes?.data, stockPrice ?? 0, profileFlip);
  const levels = levelsRes?.data
    ? computeGexLevelsFromUw(levelsRes.data, stockPrice ?? 0)
    : null;

  let callWall = levels?.callWall ?? null;
  let putWall = levels?.putWall ?? null;
  let gammaMagnet = levels?.gammaMagnet ?? null;
  const spot = stockPrice ?? 0;
  const saneProfileFlip =
    profileFlip != null && spot > 0 && isSaneGammaFlip(profileFlip, spot) ? profileFlip : null;
  const saneLevelsFlip =
    levelsFlip != null && spot > 0 && isSaneGammaFlip(levelsFlip, spot) ? levelsFlip : null;

  let gammaFlip = useAll
    ? (saneLevelsFlip ?? saneProfileFlip)
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
    strikes: fullSeries,
    availableExpiries,
  };
}
