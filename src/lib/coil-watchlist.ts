"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { CheapSetup } from "@/lib/cheap-movers/score";

const WATCHLIST_KEY = "coil_watchlist_v1";

export interface CoilWatchItem {
  ticker: string;
  savedAt: string;
  stockPrice?: number;
  tier?: CheapSetup["tier"];
  tierLabel?: string;
  scorePct?: number;
  companyName?: string;
  band?: CheapSetup["band"];
  action?: string;
}

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

function getSnapshot(): string {
  try {
    return localStorage.getItem(WATCHLIST_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerSnapshot(): string {
  return "[]";
}

function parseList(raw: string): CoilWatchItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CoilWatchItem[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const item = row as Partial<CoilWatchItem>;
      if (typeof item.ticker !== "string" || !item.ticker.trim()) continue;
      out.push({
        ticker: item.ticker.toUpperCase(),
        savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
        stockPrice: typeof item.stockPrice === "number" ? item.stockPrice : undefined,
        tier: item.tier,
        tierLabel: typeof item.tierLabel === "string" ? item.tierLabel : undefined,
        scorePct: typeof item.scorePct === "number" ? item.scorePct : undefined,
        companyName: typeof item.companyName === "string" ? item.companyName : undefined,
        band: item.band,
        action: typeof item.action === "string" ? item.action : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function read(): CoilWatchItem[] {
  return parseList(getSnapshot());
}

function write(list: CoilWatchItem[]) {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  } catch {
    // private mode / quota
  }
  emitChange();
}

export function setupToWatchItem(setup: CheapSetup): CoilWatchItem {
  return {
    ticker: setup.ticker.toUpperCase(),
    savedAt: new Date().toISOString(),
    stockPrice: setup.stockPrice,
    tier: setup.tier,
    tierLabel: setup.tierLabel,
    scorePct: setup.scorePct,
    companyName: setup.companyName,
    band: setup.band,
    action: setup.action,
  };
}

export function addToCoilWatchlist(item: CoilWatchItem | string) {
  const next =
    typeof item === "string"
      ? ({ ticker: item.toUpperCase(), savedAt: new Date().toISOString() } satisfies CoilWatchItem)
      : { ...item, ticker: item.ticker.toUpperCase() };
  const list = read().filter((row) => row.ticker !== next.ticker);
  write([next, ...list]);
}

export function removeFromCoilWatchlist(ticker: string) {
  const upper = ticker.toUpperCase();
  write(read().filter((row) => row.ticker !== upper));
}

export function toggleCoilWatchlist(item: CoilWatchItem | string) {
  const ticker = (typeof item === "string" ? item : item.ticker).toUpperCase();
  if (read().some((row) => row.ticker === ticker)) {
    removeFromCoilWatchlist(ticker);
    return false;
  }
  addToCoilWatchlist(item);
  return true;
}

export function isOnCoilWatchlist(ticker: string): boolean {
  return read().some((row) => row.ticker === ticker.toUpperCase());
}

export function getCoilWatchlist(): CoilWatchItem[] {
  return read();
}

export function clearCoilWatchlist() {
  write([]);
}

/** Live Coil watchlist — local only, separate from PreMove. */
export function useCoilWatchlist(): CoilWatchItem[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => parseList(raw), [raw]);
}

export function useIsOnCoilWatchlist(ticker: string): boolean {
  const list = useCoilWatchlist();
  const upper = ticker.toUpperCase();
  return useMemo(() => list.some((row) => row.ticker === upper), [list, upper]);
}
