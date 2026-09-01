import { describe, expect, it } from "vitest";
import {
  buildGexDealerNarrative,
  resolveRangeFeel,
  resolveStructureHorizon,
} from "@/lib/gex-study/gex-dealer-narrative";

describe("buildGexDealerNarrative", () => {
  it("describes positive gamma above flip with nearby call wall (TSLA-like)", () => {
    const narrative = buildGexDealerNarrative({
      stockPrice: 370.34,
      gammaFlip: 355.48,
      putWall: 340,
      callWall: 375,
      regime: "positive",
      flipDistancePct: 4.0,
      netGex: 5_000_000,
      dte: 4,
    });

    expect(narrative.summary).toMatch(/positive gamma/i);
    expect(narrative.bullets.some((line) => line.includes("355.48"))).toBe(true);
    expect(narrative.bullets.some((line) => line.includes("dampen"))).toBe(true);
    expect(narrative.bullets.some((line) => line.includes("Call wall"))).toBe(true);
    expect(narrative.rangeFeel).toMatch(/call wall/i);
    expect(narrative.horizon).toMatch(/several sessions/i);
    expect(narrative.validity).toMatch(/above \$355\.48/i);
  });

  it("flags fragile regime when spot hugs the flip", () => {
    const narrative = buildGexDealerNarrative({
      stockPrice: 100,
      gammaFlip: 101,
      putWall: 95,
      callWall: 105,
      regime: "negative",
      flipDistancePct: -1,
      netGex: -2_000_000,
      dte: 0,
    });

    expect(narrative.bullets.some((line) => line.includes("fragile"))).toBe(true);
    expect(narrative.horizon).toMatch(/0DTE/i);
    expect(narrative.validity).toMatch(/below \$101/i);
  });

  it("handles missing spot gracefully", () => {
    const narrative = buildGexDealerNarrative({
      stockPrice: null,
      gammaFlip: 100,
      putWall: 95,
      callWall: 105,
      regime: "neutral",
      flipDistancePct: null,
      netGex: 0,
    });

    expect(narrative.bullets).toHaveLength(0);
    expect(narrative.summary).toMatch(/unavailable/i);
  });
});

describe("resolveRangeFeel", () => {
  it("prioritizes flip fragility over other rules", () => {
    const feel = resolveRangeFeel({
      stockPrice: 100,
      gammaFlip: 101,
      putWall: 95,
      callWall: 105,
      regime: "negative",
      flipDistancePct: -1,
      netGex: 0,
      dte: 4,
    });
    expect(feel).toMatch(/very short/i);
  });

  it("flags call-wall hugging for TSLA-like spot under ceiling", () => {
    const feel = resolveRangeFeel({
      stockPrice: 370.34,
      gammaFlip: 355.48,
      putWall: 340,
      callWall: 375,
      regime: "positive",
      flipDistancePct: 4,
      netGex: 5_000_000,
      dte: 4,
    });
    expect(feel).toMatch(/hours to 1–2 days/i);
  });

  it("describes 0DTE pin between flip and call wall", () => {
    const feel = resolveRangeFeel({
      stockPrice: 100,
      gammaFlip: 97,
      putWall: 95,
      callWall: 110,
      regime: "positive",
      flipDistancePct: 3,
      netGex: 1_000_000,
      dte: 0,
    });
    expect(feel).toMatch(/last 1–3 hours/i);
  });
});

describe("resolveStructureHorizon", () => {
  it("maps DTE buckets to readable horizons", () => {
    expect(resolveStructureHorizon(0)).toMatch(/0DTE/i);
    expect(resolveStructureHorizon(2)).toMatch(/next day/i);
    expect(resolveStructureHorizon(10)).toMatch(/multi-day/i);
    expect(resolveStructureHorizon(null)).toMatch(/multiple expiries/i);
  });
});
