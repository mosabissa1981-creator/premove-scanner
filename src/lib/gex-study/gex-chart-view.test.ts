import { describe, expect, it } from "vitest";
import {
  CHART_VIEW_WIDTH,
  DEFAULT_CHART_VIEW,
  clampViewBox,
  clientToChartSvg,
  isChartZoomed,
  panChartViewBox,
  zoomChartAtPoint,
} from "@/lib/gex-study/gex-chart-view";

describe("gex chart view helpers", () => {
  it("zooms in around a focal point", () => {
    const zoomed = zoomChartAtPoint(DEFAULT_CHART_VIEW, 2, CHART_VIEW_WIDTH / 2, 150);
    expect(zoomed.w).toBe(CHART_VIEW_WIDTH / 2);
    expect(zoomed.h).toBe(150);
    expect(isChartZoomed(zoomed)).toBe(true);
  });

  it("clamps zoom to max level", () => {
    const zoomed = zoomChartAtPoint(DEFAULT_CHART_VIEW, 20, 100, 100);
    expect(zoomed.w).toBe(CHART_VIEW_WIDTH / 8);
  });

  it("pans horizontally within bounds", () => {
    const zoomed = zoomChartAtPoint(DEFAULT_CHART_VIEW, 2, CHART_VIEW_WIDTH / 2, 150);
    const panned = panChartViewBox(zoomed, -200, 0, 360, 300);
    expect(panned.x).toBeGreaterThanOrEqual(0);
    expect(panned.x).toBeLessThanOrEqual(CHART_VIEW_WIDTH - panned.w);
  });

  it("maps client coordinates into svg space", () => {
    const point = clientToChartSvg(
      180,
      150,
      { left: 0, top: 0, width: 360, height: 300 },
      DEFAULT_CHART_VIEW,
    );
    expect(point.x).toBe(CHART_VIEW_WIDTH / 2);
    expect(point.y).toBe(150);
  });
});
