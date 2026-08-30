import { describe, expect, it } from "vitest";
import {
  buildStrikeSeries,
  computeGammaFlip,
  computeWallsFromSeries,
  filterStrikeWindow,
  summarizeStrikeSeries,
} from "@/lib/gex-study/gex-study";
import type { UwGreekExposureStrikeRow } from "@/lib/unusualwhales/types";

const rows: UwGreekExposureStrikeRow[] = [
  { strike: "50", call_gex: "100000", put_gex: "-20000" },
  { strike: "55", call_gex: "80000", put_gex: "-30000" },
  { strike: "60", call_gex: "50000", put_gex: "-80000" },
  { strike: "65", call_gex: "20000", put_gex: "-120000" },
  { strike: "70", call_gex: "150000", put_gex: "-10000" },
  { strike: "75", call_gex: "200000", put_gex: "-5000" },
  { strike: "80", call_gex: "180000", put_gex: "-15000" },
];

describe("buildStrikeSeries", () => {
  it("sorts strikes and builds cumulative profile", () => {
    const series = buildStrikeSeries(rows);
    expect(series).toHaveLength(7);
    expect(series[0].strike).toBe(50);
    expect(series[0].netGex).toBe(80000);
    expect(series[series.length - 1].profile).toBe(
      series.reduce((sum, point) => sum + point.netGex, 0),
    );
  });
});

describe("computeGammaFlip", () => {
  it("interpolates zero crossing in profile", () => {
    const series = buildStrikeSeries(rows);
    const flip = computeGammaFlip(series);
    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(60);
    expect(flip!).toBeLessThan(70);
  });

  it("uses the highest zero crossing at or below spot when multiple exist", () => {
    const wideRows: UwGreekExposureStrikeRow[] = [
      { strike: "50", call_gex: "0", put_gex: "-100" },
      { strike: "60", call_gex: "200", put_gex: "0" },
      { strike: "200", call_gex: "0", put_gex: "-500" },
      { strike: "210", call_gex: "500", put_gex: "0" },
    ];
    const series = buildStrikeSeries(wideRows);
    const flip = computeGammaFlip(series, 217.55);
    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(200);
    expect(flip!).toBeLessThan(210);
  });
});

describe("computeWallsFromSeries", () => {
  it("finds put wall below spot and call wall above spot", () => {
    const series = buildStrikeSeries(rows);
    const walls = computeWallsFromSeries(series, 64);
    expect(walls.putWall).toBe(50);
    expect(walls.callWall).toBe(75);
  });
});

describe("filterStrikeWindow", () => {
  it("keeps strikes near the stock price when enough data exists", () => {
    const wideRows: UwGreekExposureStrikeRow[] = Array.from({ length: 30 }, (_, i) => ({
      strike: String(40 + i * 2),
      call_gex: "10000",
      put_gex: "-5000",
    }));
    const series = buildStrikeSeries(wideRows);
    const visible = filterStrikeWindow(series, 64, 0.2);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((p) => p.strike >= 51.2 && p.strike <= 76.8)).toBe(true);
  });
});

describe("summarizeStrikeSeries", () => {
  it("totals call, put, and net gex", () => {
    const series = buildStrikeSeries(rows);
    const totals = summarizeStrikeSeries(series);
    expect(totals.netGex).toBe(totals.callGex + totals.putGex);
    expect(totals.callGex).toBeGreaterThan(0);
    expect(totals.putGex).toBeLessThan(0);
  });
});
