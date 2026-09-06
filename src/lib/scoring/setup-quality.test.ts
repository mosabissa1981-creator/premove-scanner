import { describe, it, expect } from "vitest";
import {
  applySetupQualityFilter,
  compareSetupQuality,
  DOWNTREND_PCT,
  EXTENDED_MOVE_PCT,
  READY_MIN_SCORE,
} from "@/lib/scoring/setup-quality";
import type { PhaseResult } from "@/lib/scoring/phases";
import type { TickerAnalysis } from "@/lib/unusualwhales/types";

const readyPhase: PhaseResult = {
  phase: "ignition",
  phaseLabel: "Ready to Break",
  action: "Enter",
  holdTime: "3–10 day swing",
  tier: "ready",
};

function stub(partial: Partial<TickerAnalysis> & Pick<TickerAnalysis, "ticker">): TickerAnalysis {
  return {
    score: 8,
    maxScore: 11,
    scorePct: 70,
    tier: "ready",
    phase: "ignition",
    phaseLabel: "Ready to Break",
    action: "",
    holdTime: "",
    resistanceLevel: null,
    stopLevel: null,
    earningsInDays: null,
    earningsSoon: false,
    oiChangePerc: null,
    relativeVolume: null,
    signals: [],
    gex: null,
    premium: 0,
    bullishPremium: 0,
    bearishPremium: 0,
    premiumRatio: 0,
    darkPoolNotional: 0,
    coilScore: 50,
    ivRank: null,
    priceChangePct: 0,
    stockPrice: 100,
    inFlowAlerts: false,
    inCoilScreener: false,
    ...partial,
  };
}

describe("applySetupQualityFilter", () => {
  it("leaves non-ready tiers unchanged", () => {
    const early: PhaseResult = {
      phase: "accumulation",
      phaseLabel: "Quiet Accumulation",
      action: "",
      holdTime: "",
      tier: "early",
    };
    expect(applySetupQualityFilter(early, { score: 2, priceChangePct: 50 })).toEqual(early);
  });

  it("demotes extended runners to watch", () => {
    const result = applySetupQualityFilter(readyPhase, {
      score: 10,
      priceChangePct: EXTENDED_MOVE_PCT + 1,
    });
    expect(result.tier).toBe("watch");
    expect(result.phaseLabel).toBe("Already Extended");
  });

  it("demotes downtrends to watch", () => {
    const result = applySetupQualityFilter(readyPhase, {
      score: 10,
      priceChangePct: DOWNTREND_PCT - 1,
    });
    expect(result.tier).toBe("watch");
    expect(result.phaseLabel).toBe("Downtrend Risk");
  });

  it("demotes weak scores to setting-up", () => {
    const result = applySetupQualityFilter(readyPhase, {
      score: READY_MIN_SCORE - 1,
      priceChangePct: 1,
    });
    expect(result.tier).toBe("setting-up");
    expect(result.phaseLabel).toBe("Needs More Confirmation");
  });

  it("keeps flat high-score Ready (CRWV-like)", () => {
    const result = applySetupQualityFilter(readyPhase, {
      score: READY_MIN_SCORE,
      priceChangePct: 0.8,
    });
    expect(result).toEqual(readyPhase);
  });
});

describe("compareSetupQuality", () => {
  it("ranks ready before setting-up", () => {
    const a = stub({ ticker: "A", tier: "ready", priceChangePct: 5, coilScore: 40, score: 6 });
    const b = stub({
      ticker: "B",
      tier: "setting-up",
      priceChangePct: 0,
      coilScore: 90,
      score: 10,
    });
    expect(compareSetupQuality(a, b)).toBeLessThan(0);
  });

  it("within tier, prefers flatter % change then higher coil then score", () => {
    const flat = stub({ ticker: "CRWV", priceChangePct: 0.8, coilScore: 86, score: 8 });
    const extended = stub({ ticker: "IREN", priceChangePct: 12, coilScore: 90, score: 9 });
    expect(compareSetupQuality(flat, extended)).toBeLessThan(0);

    const highCoil = stub({ ticker: "A", priceChangePct: 1, coilScore: 90, score: 6 });
    const lowCoil = stub({ ticker: "B", priceChangePct: 1, coilScore: 40, score: 10 });
    expect(compareSetupQuality(highCoil, lowCoil)).toBeLessThan(0);

    const highScore = stub({ ticker: "A", priceChangePct: 1, coilScore: 50, score: 9 });
    const lowScore = stub({ ticker: "B", priceChangePct: 1, coilScore: 50, score: 6 });
    expect(compareSetupQuality(highScore, lowScore)).toBeLessThan(0);
  });
});
