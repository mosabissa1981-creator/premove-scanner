import type { UnusualWhalesClient } from "@/lib/unusualwhales/client";
import { aggregateGex, expiryKey, selectExpiryRows } from "@/lib/gex-scan/gex-scan";
import type {
  GexExpiryMode,
  GexStrikePoint,
  GexStudyResult,
  UwCandle,
  UwDataResponse,
  UwGreekExposureExpiryRow,
  UwGreekExposureStrikeRow,
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

export function buildStrikeSeries(rows: UwGreekExposureStrikeRow[]): GexStrikePoint[] {
  const sorted = [...rows]
    .map((row) => {
      const strike = parseNum(row.strike);
      const callGex = parseNum(row.call_gex);
      const putGex = parseNum(row.put_gex);
      return { strike, callGex, putGex, netGex: callGex + putGex, profile: 0 };
    })
    .filter((row) => row.strike > 0)
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
  if (filtered.length >= 8) return filtered;

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

export function computeGammaFlip(
  points: GexStrikePoint[],
  stockPrice: number | null = null,
): number | null {
  const crossings = collectProfileCrossings(points);
  if (!crossings.length) return null;
  if (stockPrice == null || stockPrice <= 0) return crossings[0].strike;

  // Ignore deep-OTM noise; focus on the tradeable range around spot.
  const minStrike = stockPrice * 0.45;
  const inBand = crossings.filter(
    (crossing) => crossing.strike >= minStrike && crossing.strike <= stockPrice + 1e-6,
  );

  const risingBelowSpot = inBand.filter((crossing) => crossing.rising);
  if (risingBelowSpot.length) {
    return risingBelowSpot[risingBelowSpot.length - 1].strike;
  }

  if (inBand.length) {
    return inBand.reduce((best, crossing) =>
      Math.abs(crossing.strike - stockPrice) < Math.abs(best.strike - stockPrice)
        ? crossing
        : best,
    ).strike;
  }

  // Scan the near-spot strike window for a local zero crossing below spot.
  const window = filterStrikeWindow(points, stockPrice);
  for (let i = window.length - 1; i >= 1; i--) {
    const prev = window[i - 1];
    const curr = window[i];
    if (curr.strike > stockPrice) continue;
    if (prev.profile <= 0 && curr.profile >= 0) {
      const span = curr.profile - prev.profile;
      if (span === 0) return curr.strike;
      const ratio = -prev.profile / span;
      return prev.strike + ratio * (curr.strike - prev.strike);
    }
  }

  return crossings[0].strike;
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

export async function fetchGexStudy(
  client: UnusualWhalesClient,
  ticker: string,
  expiry: string,
): Promise<GexStudyResult> {
  const [exposureRes, ohlcRes] = await Promise.all([
    client.greekExposureByExpiry(ticker) as Promise<UwDataResponse<UwGreekExposureExpiryRow[]>>,
    client.ohlc(ticker, "1d", 1) as Promise<UwDataResponse<UwCandle[]>>,
  ]);

  const expiryRows = exposureRes.data ?? [];
  const availableExpiries = expiryRows
    .map((row) => ({ expiry: expiryKey(row), dte: row.dte }))
    .filter((row) => row.expiry)
    .sort((a, b) => a.dte - b.dte);

  const stockPrice = latestClose(ohlcRes.data ?? []);
  const useAll = expiry === "all";

  const strikeRes = useAll
    ? ((await client.greekExposureByStrike(ticker)) as UwDataResponse<UwGreekExposureStrikeRow[]>)
    : ((await client.greekExposureByStrikeExpiry(
        ticker,
        expiry,
      )) as UwDataResponse<UwGreekExposureStrikeRow[]>);

  const fullSeries = buildStrikeSeries(strikeRes.data ?? []);
  const totals = useAll
    ? aggregateGex(expiryRows)
    : summarizeStrikeSeries(fullSeries);
  const walls = computeWallsFromSeries(fullSeries, stockPrice);
  const gammaFlip = computeGammaFlip(fullSeries, stockPrice);

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
    callWall: walls.callWall,
    putWall: walls.putWall,
    gammaFlip,
    gammaMagnet: walls.gammaMagnet,
    netGex: totals.netGex,
    callGex: totals.callGex,
    putGex: totals.putGex,
    regime,
    flipDistancePct,
    strikes: fullSeries,
    availableExpiries,
  };
}
