/**
 * Pure helpers: decide which scan-driven alerts to fire.
 */

import {
  formatBreakoutAlert,
  formatPnLAlert,
  formatReadyAlert,
} from "@/lib/alerts/format";
import type { AlertEvent, AlertPrefs, TrackedEntry } from "@/lib/alerts/types";
import type { TickerAnalysis } from "@/lib/unusualwhales/types";

/** Round P&L % into 5% buckets so we don't spam on every tick. */
export function pnlBucket(pct: number): string {
  const step = 5;
  const bucket = Math.trunc(pct / step) * step;
  return `${bucket >= 0 ? "+" : ""}${bucket}`;
}

export function collectScanAlerts(input: {
  results: TickerAnalysis[];
  prefs: AlertPrefs;
  previousReady: string[];
  previousBreakouts: string[];
  trackedEntries: TrackedEntry[];
  previousPnLBuckets: Record<string, string>;
}): {
  events: AlertEvent[];
  nextReady: string[];
  nextBreakouts: string[];
  nextPnLBuckets: Record<string, string>;
} {
  const readyRows = input.results.filter((r) => r.tier === "ready");
  const nextReady = readyRows.map((r) => r.ticker.toUpperCase());
  const prevReady = new Set(input.previousReady.map((t) => t.toUpperCase()));
  const prevBreakouts = new Set(input.previousBreakouts.map((t) => t.toUpperCase()));
  const events: AlertEvent[] = [];

  if (input.prefs.notifyReady) {
    for (const row of readyRows) {
      const ticker = row.ticker.toUpperCase();
      if (!prevReady.has(ticker)) {
        events.push(formatReadyAlert(row));
      }
    }
  }

  const nextBreakouts = [...input.previousBreakouts.map((t) => t.toUpperCase())];
  if (input.prefs.notifyBreakout) {
    for (const row of readyRows) {
      const ticker = row.ticker.toUpperCase();
      const px = row.stockPrice;
      const r = row.resistanceLevel;
      if (
        px != null &&
        r != null &&
        Number.isFinite(px) &&
        Number.isFinite(r) &&
        px > r &&
        !prevBreakouts.has(ticker)
      ) {
        events.push(formatBreakoutAlert(row));
        if (!nextBreakouts.includes(ticker)) nextBreakouts.push(ticker);
      }
    }
  }

  const nextPnLBuckets = { ...input.previousPnLBuckets };
  if (input.prefs.notifyPnL && input.trackedEntries.length > 0) {
    const byTicker = new Map(
      input.results.map((r) => [r.ticker.toUpperCase(), r] as const),
    );
    for (const entry of input.trackedEntries) {
      const ticker = entry.ticker.toUpperCase();
      const row = byTicker.get(ticker);
      const live = row?.stockPrice;
      if (live == null || !Number.isFinite(live) || entry.entryPrice <= 0) continue;
      const pct = ((live - entry.entryPrice) / entry.entryPrice) * 100;
      const bucket = pnlBucket(pct);
      if (nextPnLBuckets[ticker] === bucket) continue;
      // Skip first sighting at ~0% so opening an entry doesn't spam.
      if (!(ticker in nextPnLBuckets) && Math.abs(pct) < 2.5) {
        nextPnLBuckets[ticker] = bucket;
        continue;
      }
      nextPnLBuckets[ticker] = bucket;
      events.push(
        formatPnLAlert({
          ticker,
          entryPrice: entry.entryPrice,
          livePrice: live,
          note: entry.note,
        }),
      );
    }
  }

  return { events, nextReady, nextBreakouts, nextPnLBuckets };
}
