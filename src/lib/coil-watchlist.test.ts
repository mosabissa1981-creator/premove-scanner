import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addToCoilWatchlist,
  clearCoilWatchlist,
  getCoilWatchlist,
  isOnCoilWatchlist,
  removeFromCoilWatchlist,
  setupToWatchItem,
  toggleCoilWatchlist,
} from "@/lib/coil-watchlist";
import type { CheapSetup } from "@/lib/cheap-movers/score";

describe("coil watchlist", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds, checks, and removes tickers", () => {
    addToCoilWatchlist("bbig");
    expect(isOnCoilWatchlist("BBIG")).toBe(true);
    expect(getCoilWatchlist().map((r) => r.ticker)).toEqual(["BBIG"]);
    removeFromCoilWatchlist("bbig");
    expect(isOnCoilWatchlist("BBIG")).toBe(false);
  });

  it("stores snapshot fields from a setup card", () => {
    const setup = {
      ticker: "clov",
      stockPrice: 4.34,
      tier: "ready",
      tierLabel: "Ready to Move",
      scorePct: 72,
      companyName: "Clover Health",
      band: "oneToFive",
      action: "Watch breakout",
    } as CheapSetup;
    addToCoilWatchlist(setupToWatchItem(setup));
    const item = getCoilWatchlist()[0];
    expect(item.ticker).toBe("CLOV");
    expect(item.stockPrice).toBe(4.34);
    expect(item.tier).toBe("ready");
    expect(item.scorePct).toBe(72);
  });

  it("toggles and clears", () => {
    expect(toggleCoilWatchlist("SNDL")).toBe(true);
    expect(toggleCoilWatchlist("SNDL")).toBe(false);
    addToCoilWatchlist("AMC");
    addToCoilWatchlist("GRAB");
    clearCoilWatchlist();
    expect(getCoilWatchlist()).toEqual([]);
  });
});
