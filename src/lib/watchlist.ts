"use client";

import { useMemo, useSyncExternalStore } from "react";

const WATCHLIST_KEY = "premove_watchlist";

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

function read(): string[] {
  try {
    return JSON.parse(getSnapshot()) as string[];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be unavailable (private mode); nothing else to do.
  }
  emitChange();
}

export function addToWatchlist(ticker: string) {
  const list = read();
  if (!list.includes(ticker)) {
    write([...list, ticker]);
  }
}

export function removeFromWatchlist(ticker: string) {
  write(read().filter((t) => t !== ticker));
}

export function isOnWatchlist(ticker: string): boolean {
  return read().includes(ticker);
}

export function getWatchlist(): string[] {
  return read();
}

/** Live list of watchlisted tickers, kept in sync across tabs and components. */
export function useWatchlist(): string[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }, [raw]);
}

/** Whether a single ticker is on the watchlist, reactive to changes. */
export function useIsOnWatchlist(ticker: string): boolean {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    try {
      return (JSON.parse(raw) as string[]).includes(ticker);
    } catch {
      return false;
    }
  }, [raw, ticker]);
}
