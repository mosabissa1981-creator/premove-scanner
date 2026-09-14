/**
 * Bought / Sold holdings — reactive wrapper over tracked alert entries.
 * Open positions live in localStorage and power P&L / price-change push alerts.
 */

"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { TrackedEntry } from "@/lib/alerts/types";
import { ALERT_ENTRIES_KEY } from "@/lib/alerts/prefs";

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

function storage(): Storage | null {
  try {
    const ls =
      typeof globalThis !== "undefined"
        ? (globalThis as { localStorage?: Storage }).localStorage
        : undefined;
    if (!ls) return null;
    // Probe so private-mode throws are caught here.
    const probe = "__premove_holdings_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

function getSnapshot(): string {
  const ls = storage();
  if (!ls) return "[]";
  return ls.getItem(ALERT_ENTRIES_KEY) ?? "[]";
}

function getServerSnapshot(): string {
  return "[]";
}

function readEntries(): TrackedEntry[] {
  try {
    const parsed = JSON.parse(getSnapshot()) as TrackedEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: TrackedEntry[]) {
  const ls = storage();
  if (!ls) return;
  ls.setItem(ALERT_ENTRIES_KEY, JSON.stringify(entries));
  emitChange();
}

/** Mark a ticker as Bought (open holding). Replaces any prior row for that ticker. */
export function markBought(input: {
  ticker: string;
  entryPrice: number;
  resistance?: number | null;
  note?: string;
}): TrackedEntry {
  const ticker = input.ticker.trim().toUpperCase();
  const entry: TrackedEntry = {
    ticker,
    entryPrice: input.entryPrice,
    resistance: input.resistance ?? null,
    note: input.note,
    openedAt: new Date().toISOString(),
  };
  writeEntries([
    ...readEntries().filter((e) => e.ticker.toUpperCase() !== ticker),
    entry,
  ]);
  return entry;
}

/** Mark Sold — remove from open holdings. */
export function markSold(ticker: string): void {
  const upper = ticker.trim().toUpperCase();
  writeEntries(readEntries().filter((e) => e.ticker.toUpperCase() !== upper));
}

export function isBought(ticker: string): boolean {
  const upper = ticker.trim().toUpperCase();
  return readEntries().some((e) => e.ticker.toUpperCase() === upper);
}

export function getHolding(ticker: string): TrackedEntry | null {
  const upper = ticker.trim().toUpperCase();
  return readEntries().find((e) => e.ticker.toUpperCase() === upper) ?? null;
}

export function getHoldings(): TrackedEntry[] {
  return readEntries();
}

/** Live list of open holdings (Bought tickers). */
export function useHoldings(): TrackedEntry[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    try {
      const parsed = JSON.parse(raw) as TrackedEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [raw]);
}

/** Whether a ticker is currently Bought. */
export function useIsBought(ticker: string): boolean {
  const holdings = useHoldings();
  const upper = ticker.toUpperCase();
  return holdings.some((e) => e.ticker.toUpperCase() === upper);
}
