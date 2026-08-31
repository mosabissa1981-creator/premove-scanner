import { describe, expect, it } from "vitest";
import type { GexStrikePoint } from "@/lib/unusualwhales/types";
import {
  initialStrikeViewport,
  nearestStrike,
  panStrikeViewport,
  strikeBounds,
  strikesInViewport,
  zoomStrikeViewport,
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

  it("keeps ascending bounds when strike rows are unsorted", () => {
    const unsorted = [
      { strike: 800, callGex: 0, putGex: 0, netGex: 0, profile: 0 },
      { strike: 505, callGex: 0, putGex: 0, netGex: 0, profile: 0 },
      { strike: 756, callGex: 0, putGex: 0, netGex: 0, profile: 0 },
    ];
    const bounds = strikeBounds(unsorted);
    expect(bounds.min).toBe(505);
    expect(bounds.max).toBe(800);

    const vp = initialStrikeViewport(unsorted, 770);
    expect(vp.min).toBeLessThan(vp.max);
    expect(vp.min).toBeLessThanOrEqual(756);
    expect(vp.max).toBeGreaterThanOrEqual(800);
  });
});
