import type { UwCandle } from "@/lib/unusualwhales/types";

export interface DatedBar {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface BacktestRow {
  ticker: string;
  source: string;
  entryClose: number | null;
  forwardReturn: number | null; // percent
}

export interface BacktestSummary {
  picks: number;
  evaluated: number;
  winRate: number; // 0..1 over evaluated
  avgReturn: number; // percent
  medianReturn: number; // percent
  bySource: Record<string, { evaluated: number; winRate: number; avgReturn: number }>;
}

export function candleDate(candle: UwCandle): string | null {
  const raw = candle.date ?? candle.start_time ?? candle.end_time;
  if (!raw) return null;
  const iso = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function toDatedBars(candles: UwCandle[]): DatedBar[] {
  return candles
    .map((c) => ({ date: candleDate(c), close: parseFloat(c.close) }))
    .filter((b): b is DatedBar => b.date !== null && !Number.isNaN(b.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Percent return from the first bar on/after `entryDate` to `horizon` trading
 * bars later. Returns null when there isn't enough forward data.
 */
export function forwardReturnFromDate(
  bars: DatedBar[],
  entryDate: string,
  horizon: number,
): number | null {
  if (bars.length === 0 || horizon <= 0) return null;
  const entryIndex = bars.findIndex((b) => b.date >= entryDate);
  if (entryIndex === -1) return null;
  const exitIndex = entryIndex + horizon;
  if (exitIndex >= bars.length) return null;

  const entry = bars[entryIndex].close;
  const exit = bars[exitIndex].close;
  if (entry <= 0) return null;
  return ((exit - entry) / entry) * 100;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function summarizeBacktest(rows: BacktestRow[]): BacktestSummary {
  const evaluated = rows.filter((r) => r.forwardReturn !== null);
  const returns = evaluated.map((r) => r.forwardReturn as number);
  const wins = returns.filter((r) => r > 0).length;

  const bySource: BacktestSummary["bySource"] = {};
  for (const row of evaluated) {
    const bucket = (bySource[row.source] ??= { evaluated: 0, winRate: 0, avgReturn: 0 });
    bucket.evaluated += 1;
  }
  for (const source of Object.keys(bySource)) {
    const subset = evaluated.filter((r) => r.source === source).map((r) => r.forwardReturn as number);
    bySource[source].winRate = subset.length ? subset.filter((r) => r > 0).length / subset.length : 0;
    bySource[source].avgReturn = Math.round(mean(subset) * 100) / 100;
  }

  return {
    picks: rows.length,
    evaluated: evaluated.length,
    winRate: evaluated.length ? wins / evaluated.length : 0,
    avgReturn: Math.round(mean(returns) * 100) / 100,
    medianReturn: Math.round(median(returns) * 100) / 100,
    bySource,
  };
}
