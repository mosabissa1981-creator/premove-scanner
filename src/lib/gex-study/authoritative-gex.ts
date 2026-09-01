import { aggregateGex, expiryKey } from "@/lib/gex-scan/gex-scan";
import type { GexStrikePoint, UwGreekExposureExpiryRow, UwSpotExposureSnapshot } from "@/lib/unusualwhales/types";

export interface GexTotals {
  callGex: number;
  putGex: number;
  netGex: number;
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

/** Latest ticker-level net spot GEX ($ / 1% move) from UW spot-exposures. */
export function latestSpotNetGex(
  snapshots: UwSpotExposureSnapshot[] | undefined,
): number | null {
  const latest = latestSpotSnapshot(snapshots);
  if (!latest?.gamma_per_one_percent_move_oi) return null;
  const net = parseFloat(latest.gamma_per_one_percent_move_oi);
  return Number.isNaN(net) ? null : net;
}

function scaleTotals(
  totals: GexTotals,
  factor: number,
  netGex: number,
): GexTotals {
  if (!Number.isFinite(factor) || factor === 1) {
    return { ...totals, netGex };
  }
  return {
    callGex: totals.callGex * factor,
    putGex: totals.putGex * factor,
    netGex,
  };
}

/**
 * UW-authoritative headline GEX totals.
 * - `all`: spot-exposures net, with call/put scaled from full expiry book.
 * - single expiry: greek-exposure/expiry row for that date.
 */
export function resolveAuthoritativeGexTotals(
  expiry: string,
  spotSnapshots: UwSpotExposureSnapshot[] | undefined,
  expiryRows: UwGreekExposureExpiryRow[],
): GexTotals | null {
  const useAll = expiry === "all";

  if (useAll) {
    const spotNet = latestSpotNetGex(spotSnapshots);
    const book = aggregateGex(expiryRows);
    if (spotNet != null) {
      return scaleTotals(book, book.netGex !== 0 ? spotNet / book.netGex : 1, spotNet);
    }
    if (book.callGex !== 0 || book.putGex !== 0 || book.netGex !== 0) {
      return book;
    }
    return null;
  }

  const key = expiry.slice(0, 10);
  const selected = expiryRows.filter((row) => expiryKey(row) === key);
  if (!selected.length) return null;
  const totals = aggregateGex(selected);
  if (totals.callGex === 0 && totals.putGex === 0 && totals.netGex === 0) {
    return null;
  }
  return totals;
}

export function summarizeStrikeSeries(points: GexStrikePoint[]): GexTotals {
  let callGex = 0;
  let putGex = 0;
  for (const point of points) {
    callGex += point.callGex;
    putGex += point.putGex;
  }
  return { callGex, putGex, netGex: callGex + putGex };
}

export function scaleStrikeSeries(points: GexStrikePoint[], factor: number): GexStrikePoint[] {
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

/** Scale strike bars to match UW headline totals; stats use authoritative call/put/net. */
export function applyAuthoritativeGexToSeries(
  points: GexStrikePoint[],
  authoritative: GexTotals,
): { points: GexStrikePoint[]; totals: GexTotals; factor: number } {
  const strikeTotals = summarizeStrikeSeries(points);
  if (
    authoritative.netGex === 0 &&
    authoritative.callGex === 0 &&
    authoritative.putGex === 0
  ) {
    return { points, totals: authoritative, factor: 1 };
  }

  let factor = 1;
  if (strikeTotals.netGex !== 0) {
    factor = authoritative.netGex / strikeTotals.netGex;
  } else {
    const strikeMag = Math.abs(strikeTotals.callGex) + Math.abs(strikeTotals.putGex);
    const authMag = Math.abs(authoritative.callGex) + Math.abs(authoritative.putGex);
    if (strikeMag > 0 && authMag > 0) {
      factor = authMag / strikeMag;
    }
  }

  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-6) {
    return { points, totals: authoritative, factor: 1 };
  }

  return {
    points: scaleStrikeSeries(points, factor),
    totals: authoritative,
    factor,
  };
}
