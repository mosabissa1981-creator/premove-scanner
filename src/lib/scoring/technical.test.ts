import { describe, it, expect } from "vitest";
import {
  calculateCoilMetrics,
  calculateCoilScore,
  calculatePriceChangePct,
  isNearResistance,
  toPriceBars,
  type PriceBar,
} from "@/lib/scoring/technical";

function bar(close: number, high = close, low = close, open = close): PriceBar {
  return { openPrice: open, highPrice: high, lowPrice: low, closePrice: close };
}

describe("toPriceBars", () => {
  it("parses string candles and drops invalid rows", () => {
    const bars = toPriceBars([
      { open: "10", high: "11", low: "9", close: "10.5" },
      { open: "x", high: "y", low: "z", close: "nope" },
    ]);
    expect(bars).toHaveLength(1);
    expect(bars[0].closePrice).toBeCloseTo(10.5);
  });
});

describe("calculateCoilScore", () => {
  it("returns 0 with fewer than 20 bars", () => {
    expect(calculateCoilScore(Array.from({ length: 10 }, () => bar(100)))).toBe(0);
  });

  it("returns 50 when there is no historical width variation", () => {
    expect(calculateCoilScore(Array.from({ length: 25 }, () => bar(100)))).toBe(50);
  });

  it("always produces a value within 0..100", () => {
    const noisy = Array.from({ length: 40 }, (_, i) => bar(100 + Math.sin(i) * (i < 20 ? 8 : 1)));
    const score = calculateCoilScore(noisy);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("calculateCoilMetrics", () => {
  it("exposes a small band-width percentage for tight recent price action", () => {
    const tight = Array.from({ length: 30 }, () => bar(100));
    const metrics = calculateCoilMetrics(tight);
    expect(metrics.bandWidthPct).toBe(0);
    expect(metrics.score).toBe(50);
  });

  it("keeps band width independent of the 30-day return headline", () => {
    const bars = [
      ...Array.from({ length: 10 }, () => bar(70)),
      ...Array.from({ length: 20 }, () => bar(95)),
    ];
    expect(calculatePriceChangePct(bars)).toBeCloseTo(35.7, 0);
    const metrics = calculateCoilMetrics(bars);
    expect(metrics.bandWidthPct).toBe(0);
  });
});

describe("calculatePriceChangePct", () => {
  it("computes first-to-last percentage change", () => {
    expect(calculatePriceChangePct([bar(100), bar(110)])).toBeCloseTo(10);
  });

  it("returns 0 for insufficient or zero-base data", () => {
    expect(calculatePriceChangePct([bar(100)])).toBe(0);
    expect(calculatePriceChangePct([bar(0), bar(50)])).toBe(0);
  });
});

describe("isNearResistance", () => {
  it("triggers when the current close is within 2% below the prior high", () => {
    const bars = [...Array.from({ length: 10 }, () => bar(100, 100)), bar(99, 99)];
    expect(isNearResistance(bars)).toBe(true);
  });

  it("does not trigger when price is well below the prior high", () => {
    const bars = [...Array.from({ length: 10 }, () => bar(100, 100)), bar(90, 90)];
    expect(isNearResistance(bars)).toBe(false);
  });

  it("ignores the current bar's own high (a fresh breakout day is not 'approaching')", () => {
    // Prior 10-day high is 80; the last bar prints a new high at 100.
    // Old logic included that high and read distance 0 (false 'at resistance');
    // the fix excludes it so this reads as already broken out (false).
    const bars = [...Array.from({ length: 10 }, () => bar(80, 80)), bar(100, 100)];
    expect(isNearResistance(bars)).toBe(false);
  });

  it("returns false with fewer than 11 bars", () => {
    expect(isNearResistance(Array.from({ length: 10 }, () => bar(100)))).toBe(false);
  });
});
