import { describe, expect, it } from "vitest";
import { collectScanAlerts, pnlBucket } from "@/lib/alerts/scan-alerts";
import type { AlertPrefs } from "@/lib/alerts/types";
import type { TickerAnalysis } from "@/lib/unusualwhales/types";

const prefsOn: AlertPrefs = {
  webPush: { enabled: true },
  telegram: { enabled: true, botToken: "t", chatId: "1" },
  notifyReady: true,
  notifyBreakout: true,
  notifyPnL: true,
};

function stub(partial: Partial<TickerAnalysis> & Pick<TickerAnalysis, "ticker">): TickerAnalysis {
  return {
    score: 7,
    maxScore: 10,
    tier: "ready",
    phase: "ignition",
    phaseLabel: "Ready",
    action: "Buy",
    holdTime: "1–2 weeks",
    scorePct: 70,
    resistanceLevel: 100,
    signals: [],
    gex: null,
    premium: 0,
    bullishPremium: 0,
    bearishPremium: 0,
    premiumRatio: 1,
    darkPoolNotional: 0,
    coilScore: 40,
    ivRank: null,
    priceChangePct: 4,
    stockPrice: 95,
    ...partial,
  };
}

describe("pnlBucket", () => {
  it("rounds to 5% steps", () => {
    expect(pnlBucket(0)).toBe("+0");
    expect(pnlBucket(4.9)).toBe("+0");
    expect(pnlBucket(5)).toBe("+5");
    expect(pnlBucket(-6)).toBe("-5");
  });
});

describe("collectScanAlerts", () => {
  it("alerts only on newly Ready tickers", () => {
    const { events, nextReady } = collectScanAlerts({
      results: [stub({ ticker: "AMZN" }), stub({ ticker: "QCOM" })],
      prefs: prefsOn,
      previousReady: ["AMZN"],
      previousBreakouts: [],
      trackedEntries: [],
      previousPnLBuckets: {},
    });
    expect(nextReady).toEqual(["AMZN", "QCOM"]);
    expect(events.filter((e) => e.kind === "ready").map((e) => e.ticker)).toEqual(["QCOM"]);
  });

  it("fires breakout once when price clears resistance", () => {
    const { events, nextBreakouts } = collectScanAlerts({
      results: [stub({ ticker: "PLTR", stockPrice: 176.5, resistanceLevel: 176 })],
      prefs: prefsOn,
      previousReady: ["PLTR"],
      previousBreakouts: [],
      trackedEntries: [],
      previousPnLBuckets: {},
    });
    expect(events.some((e) => e.kind === "breakout" && e.ticker === "PLTR")).toBe(true);
    expect(nextBreakouts).toContain("PLTR");

    const again = collectScanAlerts({
      results: [stub({ ticker: "PLTR", stockPrice: 180, resistanceLevel: 176 })],
      prefs: prefsOn,
      previousReady: ["PLTR"],
      previousBreakouts: nextBreakouts,
      trackedEntries: [],
      previousPnLBuckets: {},
    });
    expect(again.events.filter((e) => e.kind === "breakout")).toHaveLength(0);
  });

  it("emits P&L when bucket changes", () => {
    const { events, nextPnLBuckets } = collectScanAlerts({
      results: [stub({ ticker: "FSLR", stockPrice: 110, tier: "setting-up" })],
      prefs: prefsOn,
      previousReady: [],
      previousBreakouts: [],
      trackedEntries: [
        { ticker: "FSLR", entryPrice: 100, openedAt: "2026-01-01T00:00:00.000Z" },
      ],
      previousPnLBuckets: { FSLR: "+0" },
    });
    expect(events.some((e) => e.kind === "pnl" && e.ticker === "FSLR")).toBe(true);
    expect(nextPnLBuckets.FSLR).toBe("+10");
  });

  it("skips first near-zero P&L sighting", () => {
    const { events, nextPnLBuckets } = collectScanAlerts({
      results: [stub({ ticker: "XYZ", stockPrice: 101, tier: "early" })],
      prefs: prefsOn,
      previousReady: [],
      previousBreakouts: [],
      trackedEntries: [
        { ticker: "XYZ", entryPrice: 100, openedAt: "2026-01-01T00:00:00.000Z" },
      ],
      previousPnLBuckets: {},
    });
    expect(events.filter((e) => e.kind === "pnl")).toHaveLength(0);
    expect(nextPnLBuckets.XYZ).toBe("+0");
  });
});
