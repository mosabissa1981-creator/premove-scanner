import { describe, expect, it } from "vitest";
import { parseCheapBand, priceInBand } from "@/lib/cheap-movers/universe";
import {
  buildCheapSignals,
  calcRelativeVolume,
  compareCheapSetups,
  deriveCheapTier,
  scoreCheapSeries,
  scoreCheapSignals,
  type CheapSetup,
} from "@/lib/cheap-movers/score";
import type { PriceBar } from "@/lib/scoring/technical";

function makeBars(closes: number[]): PriceBar[] {
  return closes.map((c, i) => {
    const prev = closes[Math.max(0, i - 1)];
    return {
      openPrice: prev,
      highPrice: Math.max(c, prev) * 1.01,
      lowPrice: Math.min(c, prev) * 0.99,
      closePrice: c,
    };
  });
}

describe("cheap universe bands", () => {
  it("parses bands and keeps prices ≤ $5", () => {
    expect(parseCheapBand("under1")).toBe("under1");
    expect(parseCheapBand("oneToFive")).toBe("oneToFive");
    expect(parseCheapBand(null)).toBe("all");
    expect(priceInBand(0.42, "under1")).toBe(true);
    expect(priceInBand(0.42, "oneToFive")).toBe(false);
    expect(priceInBand(3.2, "oneToFive")).toBe(true);
    expect(priceInBand(3.2, "under1")).toBe(false);
    expect(priceInBand(6, "all")).toBe(false);
    expect(priceInBand(4.5, "all")).toBe(true);
  });
});

describe("cheap scoring", () => {
  it("computes relative volume", () => {
    const vols = Array.from({ length: 21 }, (_, i) => (i === 20 ? 3_000_000 : 1_000_000));
    expect(calcRelativeVolume(vols)).toBeCloseTo(3, 5);
  });

  it("scores a coiled quiet name under $5", () => {
    const base = Array.from({ length: 25 }, () => 2.0);
    base[base.length - 1] = 2.02;
    const bars = makeBars(base);
    for (let i = bars.length - 11; i < bars.length - 1; i++) {
      bars[i].highPrice = 2.05;
    }
    bars[bars.length - 1].closePrice = 2.03;
    bars[bars.length - 1].highPrice = 2.04;

    const volumes = Array.from({ length: bars.length }, (_, i) =>
      i === bars.length - 1 ? 2_500_000 : 800_000,
    );

    const setup = scoreCheapSeries({
      ticker: "TEST",
      stockPrice: 2.03,
      bars,
      volumes,
    });
    expect(setup).not.toBeNull();
    expect(setup!.stockPrice).toBeLessThanOrEqual(5);
    expect(setup!.band).toBe("oneToFive");
    expect(["ready", "setting-up", "early"]).toContain(setup!.tier);
  });

  it("fires all signals on a strong coiled+volume+breakout base", () => {
    const signals = buildCheapSignals({
      coilScore: 80,
      bandWidthPct: 4,
      priceChangePct: 2,
      change1dPct: 0.5,
      relativeVolume: 2.8,
      nearResistance: true,
    });
    expect(signals.every((s) => s.triggered)).toBe(true);
    const { scorePct } = scoreCheapSignals(signals);
    expect(scorePct).toBeGreaterThan(70);
    expect(deriveCheapTier(signals, scorePct).tier).toBe("ready");
  });

  it("marks ready with only two signals under the lighter rules", () => {
    const signals = buildCheapSignals({
      coilScore: 50,
      bandWidthPct: 8,
      priceChangePct: 10,
      change1dPct: 1,
      relativeVolume: 1.3,
      nearResistance: false,
    });
    expect(byTriggered(signals, "coil")).toBe(true);
    expect(byTriggered(signals, "volume")).toBe(true);
    expect(byTriggered(signals, "breakout")).toBe(false);
    const { scorePct } = scoreCheapSignals(signals);
    expect(deriveCheapTier(signals, scorePct).tier).toBe("ready");
  });

  it("keeps a mild coil-only name as early instead of dropping it", () => {
    const signals = buildCheapSignals({
      coilScore: 48,
      bandWidthPct: 10,
      priceChangePct: 18,
      change1dPct: 3,
      relativeVolume: 0.9,
      nearResistance: false,
    });
    expect(byTriggered(signals, "coil")).toBe(true);
    const { scorePct } = scoreCheapSignals(signals);
    expect(deriveCheapTier(signals, scorePct).tier).toBe("early");
  });

  it("sorts ready ahead of early", () => {
    const ready = {
      ticker: "A",
      tier: "ready",
      scorePct: 50,
      relativeVolume: 1,
    } as CheapSetup;
    const early = {
      ticker: "B",
      tier: "early",
      scorePct: 90,
      relativeVolume: 5,
    } as CheapSetup;
    expect(compareCheapSetups(ready, early)).toBeLessThan(0);
  });
});

function byTriggered(signals: ReturnType<typeof buildCheapSignals>, id: string): boolean {
  return signals.find((s) => s.id === id)?.triggered ?? false;
}
