import { describe, it, expect } from "vitest";
import {
  buildSignals,
  scoreSignals,
  discoveryRank,
  resolveCandidateForTicker,
} from "@/lib/scoring/confluence";
import type { CandidateMeta, SignalDetail } from "@/lib/unusualwhales/types";

type SignalInput = Parameters<typeof buildSignals>[0];

function strongSetup(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    coilScore: 90,
    coilBandWidthPct: 4.2,
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

  it("describes coiling with band width, not 30-day price change", () => {
    const signals = buildSignals(strongSetup({ coilBandWidthPct: 3.8, priceChangePct: 35.7 }));
    expect(byId(signals, "coil").description).toContain("3.8% band width");
    expect(byId(signals, "coil").description).not.toContain("35.7%");
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

describe("resolveCandidateForTicker", () => {
  it("marks flat-call and flow sources using the same bucket filters as discoverCandidates", async () => {
    const client = {
      stockScreener: async (params: Record<string, string | undefined>) => {
        if (params.min_net_call_premium) {
          return {
            data: [
              {
                ticker: "RKLB",
                close: "24.50",
                bullish_premium: "400000",
                bearish_premium: "100000",
                call_premium: "300000",
                put_premium: "50000",
                total_oi_change_perc: "8",
                next_earnings_date: "2026-09-15",
              },
            ],
          };
        }
        if (params.min_total_oi_change_perc) {
          return { data: [] };
        }
        return { data: [] };
      },
      tickerFlowAlerts: async () => ({
        data: [{ ticker: "RKLB", total_premium: "150000", underlying_price: "24.5" }],
      }),
      optionsVolume: async () => ({
        data: [
          {
            bullish_premium: "400000",
            bearish_premium: "100000",
            call_premium: "300000",
            put_premium: "50000",
            net_call_premium: "300000",
            net_put_premium: "50000",
          },
        ],
      }),
    };

    const candidate = await resolveCandidateForTicker(client as never, "RKLB");
    expect(candidate.sources).toEqual(["flat-call", "flow"]);
    expect(candidate.inCoilScreener).toBe(true);
    expect(candidate.inFlowAlerts).toBe(true);
    expect(candidate.entry.premium).toBeGreaterThan(0);
  });
});
