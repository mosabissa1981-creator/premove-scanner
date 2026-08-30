import { describe, expect, it } from "vitest";
import type { GexStrikePoint } from "@/lib/unusualwhales/types";
import {
  initialStrikeViewport,
  nearestStrike,
  panStrikeViewport,
  strikeBounds,
  strikesInViewport,
  zoomStrikeViewport,
  zoomYScale,
  clampYScale,
  isYScaleZoomed,
} from "@/lib/gex-study/gex-chart-viewport";

const points: GexStrikePoint[] = Array.from({ length: 21 }, (_, i) => {
  const strike = 40 + i * 2;
  const netGex = strike < 64 ? -100000 : 100000;
  return { strike, callGex: 50000, putGex: netGex - 50000, netGex, profile: i * 10000 };
});

describe("strike viewport helpers", () => {
  it("centers initial viewport around stock price", () => {
    const vp = initialStrikeViewport(points, 64);
    expect(vp.min).toBeLessThan(64);
    expect(vp.max).toBeGreaterThan(64);
  });

  it("zooms in around a focal strike", () => {
    const bounds = strikeBounds(points);
    const initial = initialStrikeViewport(points, 64);
    const zoomed = zoomStrikeViewport(initial, 2, 64, bounds);
    expect(zoomed.max - zoomed.min).toBeLessThan(initial.max - initial.min);
  });

  it("pans within bounds", () => {
    const bounds = strikeBounds(points);
    const initial = initialStrikeViewport(points, 64);
    const panned = panStrikeViewport(initial, 10, bounds);
    expect(panned.min).toBeGreaterThanOrEqual(bounds.min);
    expect(panned.max).toBeLessThanOrEqual(bounds.max);
  });

  it("filters visible strikes and finds nearest bar", () => {
    const vp = { min: 60, max: 70 };
    const visible = strikesInViewport(points, vp);
    expect(visible.every((p) => p.strike >= 60 && p.strike <= 70)).toBe(true);
    expect(nearestStrike(visible, 63)?.strike).toBe(62);
  });

  it("clamps and zooms vertical scale", () => {
    expect(clampYScale(0.1)).toBe(0.25);
    expect(clampYScale(10)).toBe(4);
    expect(zoomYScale(1, 2)).toBe(2);
    expect(isYScaleZoomed(1.2)).toBe(true);
    expect(isYScaleZoomed(1)).toBe(false);
  });
});
