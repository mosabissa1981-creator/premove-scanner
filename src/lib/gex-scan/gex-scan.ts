import type { UnusualWhalesClient } from "@/lib/unusualwhales/client";
import { computeGexLevelsFromUw } from "@/lib/scoring/gex";
import type {
  GexExpiryMode,
  GexScanRow,
  UwCandle,
  UwDataResponse,
  UwGexLevels,
  UwGreekExposureExpiryRow,
} from "@/lib/unusualwhales/types";

const TV = ["NASDAQ:", "NYSE:", "AMEX:", "CBOE:", "BATS:", "ARCA:", "NYSEARCA:", "OTC:"];

export const MAX_GEX_TICKERS = 100;

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nextWeekday(from = new Date()): Date {
  const d = new Date(from);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function nextFriday(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return d;
}

export function thirdFridayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month, 1);
  while (d.getDay() !== 5) {
    d.setDate(d.getDate() + 1);
  }
  d.setDate(d.getDate() + 14);
  return d;
}

export function resolveMonthlyExpiry(from = new Date()): string {
  let target = thirdFridayOfMonth(from.getFullYear(), from.getMonth());
  if (target < from) {
    const nextMonth = from.getMonth() === 11 ? 0 : from.getMonth() + 1;
    const year = from.getMonth() === 11 ? from.getFullYear() + 1 : from.getFullYear();
    target = thirdFridayOfMonth(year, nextMonth);
  }
  return ymd(target);
}

export function normalizeTicker(raw: string): string {
  let t = String(raw || "").trim().toUpperCase();
  if (!t || t.startsWith("#")) return "";
  for (const prefix of TV) {
    if (t.startsWith(prefix)) {
      t = t.slice(prefix.length);
      break;
    }
  }
  return t.split(",")[0].replace(/[^A-Z0-9.\-]/g, "");
}

export function parseTickers(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(text || "").split(/[,;\s]+/)) {
    const symbol = normalizeTicker(part);
    if (symbol && !seen.has(symbol)) {
      seen.add(symbol);
      out.push(symbol);
    }
  }
  return out;
}

function expiryKey(row: UwGreekExposureExpiryRow): string {
  return String(row.expiry || "").slice(0, 10);
}

export function selectExpiryRows(
  rows: UwGreekExposureExpiryRow[],
  mode: GexExpiryMode,
  now = new Date(),
): UwGreekExposureExpiryRow[] {
  if (!rows.length) return [];
  if (mode === "all") return rows;

  if (mode === "daily") {
    const zeroDte = rows.filter((row) => row.dte === 0);
    if (zeroDte.length) return zeroDte;
    const minDte = Math.min(...rows.map((row) => row.dte));
    return rows.filter((row) => row.dte === minDte);
  }

  if (mode === "weekly") {
    const target = ymd(nextFriday(now));
    const match = rows.filter((row) => expiryKey(row) === target);
    if (match.length) return match;
    const fridays = rows.filter((row) => {
      const d = new Date(expiryKey(row) + "T12:00:00");
      return d.getDay() === 5;
    });
    if (!fridays.length) return rows.slice(0, 1);
    fridays.sort((a, b) => a.dte - b.dte);
    return [fridays[0]];
  }

  const target = resolveMonthlyExpiry(now);
  const match = rows.filter((row) => expiryKey(row) === target);
  if (match.length) return match;
  const monthlies = rows.filter((row) => {
    const d = new Date(expiryKey(row) + "T12:00:00");
    return d.getDay() === 5 && d.getDate() >= 15 && d.getDate() <= 21;
  });
  if (!monthlies.length) return rows.slice(-1);
  monthlies.sort((a, b) => a.dte - b.dte);
  return [monthlies[0]];
}

export function aggregateGex(rows: UwGreekExposureExpiryRow[]): {
  callGex: number;
  putGex: number;
  netGex: number;
  expiry: string | null;
} {
  let callGex = 0;
  let putGex = 0;
  const expiries: string[] = [];

  for (const row of rows) {
    callGex += parseFloat(row.call_gex) || 0;
    putGex += parseFloat(row.put_gex) || 0;
    if (row.expiry) expiries.push(expiryKey(row));
  }

  return {
    callGex,
    putGex,
    netGex: callGex + putGex,
    expiry: expiries.length === 1 ? expiries[0] : expiries.length > 1 ? "all" : null,
  };
}

export function gexSides(row: Pick<GexScanRow, "callGex" | "putGex">): {
  callAbs: number;
  putAbs: number;
  imbalance: number;
  callHeavy: boolean;
} {
  const callAbs = Math.abs(row.callGex);
  const putAbs = Math.abs(row.putGex);
  const max = Math.max(callAbs, putAbs);
  const min = Math.min(callAbs, putAbs);
  const imbalance = min > 0 ? max / min : max > 0 ? 1e12 : 1;
  return { callAbs, putAbs, imbalance, callHeavy: callAbs >= putAbs };
}

function fmtRatioPart(n: number): string {
  if (!Number.isFinite(n) || n >= 1e12) return "∞";
  if (n >= 10) return n.toFixed(1);
  if (n >= 3) return Number.isInteger(n) ? String(n) : n.toFixed(1);
  return String(Number(n.toFixed(2)));
}

export function ratioLabel(row: Pick<GexScanRow, "callGex" | "putGex">): string {
  const { callAbs, putAbs, imbalance, callHeavy } = gexSides(row);
  if (callAbs === 0 && putAbs === 0) return "—";
  if (callAbs === 0) return "0 : 1";
  if (putAbs === 0) return "1 : 0";
  return callHeavy ? `${fmtRatioPart(imbalance)} : 1` : `1 : ${fmtRatioPart(imbalance)}`;
}

export function tierClass(row: Pick<GexScanRow, "callGex" | "putGex">): string {
  const { imbalance, callHeavy } = gexSides(row);
  const side = callHeavy ? "call" : "put";
  if (imbalance >= 3) return `tier-${side}-hi`;
  if (imbalance >= 2) return `tier-${side}-mid`;
  if (imbalance >= 1.5) return `tier-${side}-lo`;
  return "";
}

function parseWall(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function latestClose(candles: UwCandle[]): number | null {
  const last = candles[candles.length - 1];
  if (!last?.close) return null;
  const n = parseFloat(last.close);
  return Number.isNaN(n) ? null : n;
}

export async function fetchGexForTicker(
  client: UnusualWhalesClient,
  ticker: string,
  expiryMode: GexExpiryMode,
): Promise<GexScanRow> {
  const [exposureRes, levelsRes, ohlcRes] = await Promise.all([
    client.greekExposureByExpiry(ticker) as Promise<UwDataResponse<UwGreekExposureExpiryRow[]>>,
    client.gexLevels(ticker, "oi") as Promise<UwDataResponse<UwGexLevels>>,
    client.ohlc(ticker, "1d", 1) as Promise<UwDataResponse<UwCandle[]>>,
  ]);

  const rows = exposureRes.data ?? [];
  const selected = selectExpiryRows(rows, expiryMode);
  const { callGex, putGex, netGex, expiry } = aggregateGex(selected);
  const stockPrice = latestClose(ohlcRes.data ?? []);
  const gex = levelsRes.data
    ? computeGexLevelsFromUw(levelsRes.data, stockPrice ?? 0)
    : null;
  const dominant = Math.abs(callGex) >= Math.abs(putGex) ? "CALL" : "PUT";

  return {
    ticker,
    source: "unusual-whales",
    expiry: expiry ?? expiryMode,
    callGex,
    putGex,
    netGex,
    dominant,
    callWall: gex?.callWall ?? parseWall(levelsRes.data?.call_wall),
    putWall: gex?.putWall ?? parseWall(levelsRes.data?.put_wall),
    gammaFlip: gex?.gammaFlip ?? null,
    gammaMagnet: gex?.gammaMagnet ?? null,
    stockPrice,
    regime: gex?.regime ?? "neutral",
    flipDistancePct: gex?.flipDistancePct ?? null,
    ratio: ratioLabel({ callGex, putGex }),
    imbalance: gexSides({ callGex, putGex }).imbalance,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runGexScan(
  client: UnusualWhalesClient,
  tickers: string[],
  expiryMode: GexExpiryMode,
  options: { delayMs?: number } = {},
): Promise<{ rows: GexScanRow[]; errors: string[]; expiration: string }> {
  const delayMs = options.delayMs ?? 250;
  const rows: GexScanRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    try {
      rows.push(await fetchGexForTicker(client, ticker, expiryMode));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      errors.push(`${ticker}: ${message}`);
      rows.push({
        ticker,
        source: "unusual-whales",
        expiry: expiryMode,
        callGex: 0,
        putGex: 0,
        netGex: 0,
        dominant: "CALL",
        callWall: null,
        putWall: null,
        gammaFlip: null,
        gammaMagnet: null,
        stockPrice: null,
        regime: "neutral",
        flipDistancePct: null,
        ratio: "—",
        imbalance: 1,
        error: message,
      });
    }
    if (i < tickers.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const expiration =
    expiryMode === "all"
      ? "all"
      : expiryMode === "daily"
        ? ymd(nextWeekday())
        : expiryMode === "weekly"
          ? ymd(nextFriday())
          : resolveMonthlyExpiry();

  return { rows, errors, expiration };
}

export function filterAndSortGexRows(rows: GexScanRow[], minRatio = 1): GexScanRow[] {
  return rows
    .filter((row) => !row.error && gexSides(row).imbalance >= minRatio)
    .sort((a, b) => {
      const ia = gexSides(a).imbalance;
      const ib = gexSides(b).imbalance;
      const fa = Number.isFinite(ia) ? ia : 1e12;
      const fb = Number.isFinite(ib) ? ib : 1e12;
      return fb - fa;
    });
}
