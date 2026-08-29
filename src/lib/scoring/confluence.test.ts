import { describe, it, expect } from "vitest";
import { buildSignals, scoreSignals, discoveryRank } from "@/lib/scoring/confluence";
import type { CandidateMeta, SignalDetail } from "@/lib/unusualwhales/types";

type SignalInput = Parameters<typeof buildSignals>[0];

function strongSetup(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    coilScore: 90,
    darkPoolNotional: 20_000_000,
    darkPoolBaseline: 3_000_000,
    premiumRatio: 0.5,
    premium: 500_000,
    ivRank: 80,
    priceChangePct: 0.5,
    nearResistance: true,
    resistanceDistancePct: 0.5,
    gexFlipDistance: 1,
    aggressiveFlow: true,
    bullishNetFlow: true,
    inFlowAlerts: true,
    earningsSoon: false,
    ...overrides,
  };
}

function byId(signals: SignalDetail[], id: string): SignalDetail {
  const s = signals.find((x) => x.id === id);
  if (!s) throw new Error(`signal ${id} not found`);
  return s;
}

describe("buildSignals", () => {
  it("fires all confluence signals on a strong setup, with high graded score", () => {
    const signals = buildSignals(strongSetup());
    expect(signals.every((s) => s.triggered)).toBe(true);
    const { scorePct } = scoreSignals(signals);
    expect(scorePct).toBeGreaterThan(80);
  });

  it("dampens the IV signal when earnings are imminent", () => {
    const base = byId(buildSignals(strongSetup({ earningsSoon: false })), "iv").strength;
    const soon = byId(buildSignals(strongSetup({ earningsSoon: true })), "iv").strength;
    expect(soon).toBeLessThan(base);
    expect(soon).toBeCloseTo(base * 0.25, 5);
  });

  it("does not trigger accumulation signals when price is not flat", () => {
    const signals = buildSignals(strongSetup({ priceChangePct: 8 }));
    expect(byId(signals, "coil").triggered).toBe(false);
    expect(byId(signals, "darkpool").triggered).toBe(false);
  });

  it("keeps dark-pool off when notional is below baseline", () => {
    const signals = buildSignals(
      strongSetup({ darkPoolNotional: 1_000_000, darkPoolBaseline: 3_000_000 }),
    );
    expect(byId(signals, "darkpool").triggered).toBe(false);
  });
});

describe("scoreSignals", () => {
  it("sums points weighted by strength for triggered signals only", () => {
    const signals: SignalDetail[] = [
      { id: "a", label: "a", phase: "accumulation", points: 2, triggered: true, strength: 0.5, description: "" },
      { id: "b", label: "b", phase: "conviction", points: 2, triggered: true, strength: 1, description: "" },
      { id: "c", label: "c", phase: "ignition", points: 2, triggered: false, strength: 1, description: "" },
    ];
    const { score, maxScore, scorePct } = scoreSignals(signals);
    expect(maxScore).toBe(6);
    expect(score).toBeCloseTo(3); // 2*0.5 + 2*1 + 0
    expect(scorePct).toBe(50);
  });
});

describe("discoveryRank", () => {
  const base: Omit<CandidateMeta, "sources" | "inFlowAlerts" | "inCoilScreener"> = {
    ticker: "X",
    entry: {
      bullishPremium: 0,
      bearishPremium: 0,
      premium: 0,
      premiumRatio: 1,
      tradeCount: 0,
      volume: 0,
    },
  };

  it("ranks a multi-source, rising-OI candidate above a single-source one", () => {
    const multi: CandidateMeta = {
      ...base,
      sources: ["flat-call", "oi-change", "flow"],
      inFlowAlerts: true,
      inCoilScreener: true,
      oiChangePerc: 20,
      relativeVolume: 3,
    };
    const single: CandidateMeta = {
      ...base,
      sources: ["flat-call"],
      inFlowAlerts: false,
      inCoilScreener: true,
    };
    expect(discoveryRank(multi)).toBeGreaterThan(discoveryRank(single));
  });
});
