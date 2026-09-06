import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@/lib/unusualwhales/types";
import {
  LAST_SCAN_STORAGE_KEY,
  clearLastSwingScan,
  loadLastSwingScan,
  saveLastSwingScan,
} from "@/lib/last-swing-scan";

const sampleScan: ScanResult = {
  scannedAt: "2026-09-06T12:00:00.000Z",
  candidatesScreened: 40,
  results: [
    {
      ticker: "AAPL",
      score: 8,
      maxScore: 11,
      tier: "ready",
      phase: "ignition",
      phaseLabel: "Ignition",
      action: "Watch breakout",
      holdTime: "3–10 days",
      scorePct: 73,
      signals: [],
      gex: null,
      premium: 1,
      bullishPremium: 1,
      bearishPremium: 0,
      premiumRatio: 1,
      darkPoolNotional: 0,
      coilScore: 70,
      ivRank: null,
      priceChangePct: 0.5,
    },
  ],
  errors: [],
  strategy: "confluence",
};

describe("last-swing-scan cache", () => {
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

  it("round-trips a scan result", () => {
    saveLastSwingScan(sampleScan);
    expect(loadLastSwingScan()).toEqual(sampleScan);
    expect(store.has(LAST_SCAN_STORAGE_KEY)).toBe(true);
  });

  it("returns null for corrupt or wrong-version payload", () => {
    store.set(
      LAST_SCAN_STORAGE_KEY,
      JSON.stringify({ version: 999, scan: sampleScan }),
    );
    expect(loadLastSwingScan()).toBeNull();

    store.set(LAST_SCAN_STORAGE_KEY, "{not-json");
    expect(loadLastSwingScan()).toBeNull();
  });

  it("clears the cached scan", () => {
    saveLastSwingScan(sampleScan);
    clearLastSwingScan();
    expect(loadLastSwingScan()).toBeNull();
  });
});
