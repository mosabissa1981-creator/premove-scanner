import { describe, expect, it } from "vitest";
import {
  buildStrikeSeries,
  computeGammaFlip,
  computeGammaFlipDeep,
  computeGammaFlipFromWindow,
  computeWallsFromSeries,
  filterStrikeWindow,
  hasUsableSpotStrikes,
  pickAllExpiryGammaFlip,
  pickDeepestSaneFlipBelowSpot,
  prepareChartStrikeSeries,
  rebaseProfileWindow,
  resolveTradingDate,
  summarizeStrikeSeries,
} from "@/lib/gex-study/gex-study";
import type { UwSpotExposureStrikeRow } from "@/lib/unusualwhales/types";

const rows: UwSpotExposureStrikeRow[] = [
  { strike: "50", call_gamma_oi: "100000", put_gamma_oi: "-20000" },
  { strike: "55", call_gamma_oi: "80000", put_gamma_oi: "-30000" },
  { strike: "60", call_gamma_oi: "50000", put_gamma_oi: "-80000" },
  { strike: "65", call_gamma_oi: "20000", put_gamma_oi: "-120000" },
  { strike: "70", call_gamma_oi: "150000", put_gamma_oi: "-10000" },
  { strike: "75", call_gamma_oi: "200000", put_gamma_oi: "-5000" },
  { strike: "80", call_gamma_oi: "180000", put_gamma_oi: "-15000" },
];

describe("hasUsableSpotStrikes", () => {
  it("rejects rows without strike or gamma values", () => {
    expect(
      hasUsableSpotStrikes([
        { strike: "0", call_gamma_oi: "0", put_gamma_oi: "0" },
        { strike: "200", call_gamma_oi: "0", put_gamma_oi: "0" },
      ]),
    ).toBe(false);
    expect(
      hasUsableSpotStrikes([
        { strike: "200", call_gamma_oi: "100", put_gamma_oi: "-50" },
        { strike: "210", call_gamma_oi: "80", put_gamma_oi: "-20" },
        { strike: "220", call_gamma_oi: "60", put_gamma_oi: "-10" },
        { strike: "230", call_gamma_oi: "40", put_gamma_oi: "-5" },
      ]),
    ).toBe(true);
  });
});

describe("resolveTradingDate", () => {
  it("uses the OHLC session date when available", () => {
    expect(
      resolveTradingDate(
        [{ open: "100", high: "100", low: "100", close: "100", date: "2026-08-29" }],
        new Date("2026-08-30T12:00:00Z"),
      ),
    ).toBe("2026-08-29");
  });
});

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

  it("drops deep OTM strikes far below spot", () => {
    const wideRows: UwSpotExposureStrikeRow[] = [
      { strike: "0.5", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "4.5", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "200", call_gamma_oi: "500", put_gamma_oi: "-100" },
      { strike: "220", call_gamma_oi: "100", put_gamma_oi: "-50" },
    ];
    const series = buildStrikeSeries(wideRows, 217.55);
    expect(series.every((point) => point.strike >= 217.55 * 0.15)).toBe(true);
    expect(series[0].strike).toBe(200);
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

  it("uses the zero crossing nearest to spot, ignoring deep OTM noise", () => {
    const wideRows: UwSpotExposureStrikeRow[] = [
      { strike: "5", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "10", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "190", call_gamma_oi: "0", put_gamma_oi: "-500" },
      { strike: "200", call_gamma_oi: "500", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(wideRows);
    const flip = computeGammaFlip(series, 217.55);
    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(190);
    expect(flip!).toBeLessThan(205);
  });

  it("prefers the crossing closest to spot when multiple exist", () => {
    const wideRows: UwSpotExposureStrikeRow[] = [
      { strike: "50", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "60", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "200", call_gamma_oi: "0", put_gamma_oi: "-500" },
      { strike: "210", call_gamma_oi: "500", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(wideRows);
    const flip = computeGammaFlip(series, 217.55);
    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(200);
    expect(flip!).toBeLessThan(210);
  });
});

describe("computeGammaFlipFromWindow", () => {
  it("finds the rising flip below spot inside the ATM window", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "5", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "10", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "180", call_gamma_oi: "0", put_gamma_oi: "-500" },
      { strike: "200", call_gamma_oi: "500", put_gamma_oi: "0" },
      { strike: "220", call_gamma_oi: "100", put_gamma_oi: "-50" },
    ];
    const series = buildStrikeSeries(rows);
    const flip = computeGammaFlipFromWindow(series, 217.55);
    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(190);
    expect(flip!).toBeLessThan(220);
  });

  it("ignores deep-OTM chain history by rebasing the profile in-window", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "5", call_gamma_oi: "0", put_gamma_oi: "-1000" },
      { strike: "10", call_gamma_oi: "5000", put_gamma_oi: "0" },
      { strike: "150", call_gamma_oi: "100", put_gamma_oi: "-50" },
      { strike: "180", call_gamma_oi: "50", put_gamma_oi: "-200" },
      { strike: "195", call_gamma_oi: "20", put_gamma_oi: "-80" },
      { strike: "200", call_gamma_oi: "300", put_gamma_oi: "-20" },
      { strike: "210", call_gamma_oi: "400", put_gamma_oi: "0" },
      { strike: "220", call_gamma_oi: "200", put_gamma_oi: "-10" },
      { strike: "230", call_gamma_oi: "100", put_gamma_oi: "-5" },
    ];
    const series = buildStrikeSeries(rows);
    expect(computeGammaFlip(series, 217.55)).toBeLessThan(20);

    const rebased = rebaseProfileWindow(series, 217.55);
    expect(rebased.some((point) => point.profile < 0)).toBe(true);
    expect(rebased.some((point) => point.profile > 0)).toBe(true);

    const flip = computeGammaFlipFromWindow(series, 217.55);
    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(180);
    expect(flip!).toBeLessThan(215);
  });
});

describe("computeGammaFlipDeep", () => {
  it("uses the deepest rising crossing below spot on the full profile", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "380", call_gamma_oi: "0", put_gamma_oi: "-500" },
      { strike: "405", call_gamma_oi: "700", put_gamma_oi: "0" },
      { strike: "470", call_gamma_oi: "0", put_gamma_oi: "-200" },
      { strike: "490", call_gamma_oi: "300", put_gamma_oi: "0" },
      { strike: "520", call_gamma_oi: "100", put_gamma_oi: "-50" },
    ];
    const series = buildStrikeSeries(rows);
    const deep = computeGammaFlipDeep(series, 513.15);
    const near = computeGammaFlipFromWindow(series, 513.15);
    expect(deep).not.toBeNull();
    expect(deep!).toBeGreaterThan(390);
    expect(deep!).toBeLessThan(420);
    expect(near).not.toBeNull();
    expect(near!).toBeGreaterThan(deep!);
  });
});

describe("pickDeepestSaneFlipBelowSpot", () => {
  it("prefers the deeper flip when UW returns a nearer level", () => {
    const flip = pickDeepestSaneFlipBelowSpot([492.51, 404.27, 464.68], 513.15);
    expect(flip).toBeCloseTo(404.27, 1);
  });

  it("ignores junk crossings far below spot", () => {
    const flip = pickDeepestSaneFlipBelowSpot([103.85, 344.28], 348.75);
    expect(flip).toBeCloseTo(344.28, 1);
  });
});

describe("prepareChartStrikeSeries", () => {
  it("rebases profile inside the ATM window for chart display", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "5", call_gamma_oi: "0", put_gamma_oi: "-1000" },
      { strike: "10", call_gamma_oi: "5000", put_gamma_oi: "0" },
      { strike: "150", call_gamma_oi: "100", put_gamma_oi: "-50" },
      { strike: "180", call_gamma_oi: "50", put_gamma_oi: "-200" },
      { strike: "195", call_gamma_oi: "20", put_gamma_oi: "-80" },
      { strike: "200", call_gamma_oi: "300", put_gamma_oi: "-20" },
      { strike: "210", call_gamma_oi: "400", put_gamma_oi: "0" },
      { strike: "220", call_gamma_oi: "200", put_gamma_oi: "-10" },
      { strike: "230", call_gamma_oi: "100", put_gamma_oi: "-5" },
    ];
    const series = buildStrikeSeries(rows);
    const chart = prepareChartStrikeSeries(series, 217.55);
    expect(chart[0]?.strike).toBeGreaterThanOrEqual(150);
    expect(chart[0]?.profile).toBe(0);
    expect(chart[chart.length - 1]?.profile).not.toBe(series[series.length - 1]?.profile);
  });
});

describe("pickAllExpiryGammaFlip", () => {
  it("uses the ATM profile flip for TSLA instead of a deep junk crossing", () => {
    const flip = pickAllExpiryGammaFlip(344.28, 103.85, 103.85, 348.75);
    expect(flip).toBeCloseTo(344.28, 1);
  });

  it("uses UW levels when profile flip is unavailable", () => {
    const flip = pickAllExpiryGammaFlip(null, 344.28, null, 348.75);
    expect(flip).toBeCloseTo(344.28, 1);
  });

  it("prefers UW levels when profile is a deep outlier on greek fallback data", () => {
    const flip = pickAllExpiryGammaFlip(230, 344.28, null, 348.75);
    expect(flip).toBeCloseTo(344.28, 1);
  });

  it("prefers the deeper UW flip for MSFT when profile is nearer to spot", () => {
    const flip = pickAllExpiryGammaFlip(492.51, 404.27, 464.68, 513.15);
    expect(flip).toBeCloseTo(404.27, 1);
  });

  it("keeps the deeper NVDA flip when both profile and levels are valid", () => {
    const flip = pickAllExpiryGammaFlip(216.43, 199.77, null, 217.55);
    expect(flip).toBeCloseTo(199.77, 1);
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
    const wideRows: UwSpotExposureStrikeRow[] = Array.from({ length: 30 }, (_, i) => ({
      strike: String(40 + i * 2),
      call_gamma_oi: "10000",
      put_gamma_oi: "-5000",
    }));
    const series = buildStrikeSeries(wideRows);
    const visible = filterStrikeWindow(series, 64, 0.2);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((p) => p.strike >= 51.2 && p.strike <= 76.8)).toBe(true);
  });

  it("keeps a tight band around spot even with fewer than eight strikes", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "200", call_gamma_oi: "100", put_gamma_oi: "-50" },
      { strike: "210", call_gamma_oi: "100", put_gamma_oi: "-50" },
      { strike: "220", call_gamma_oi: "100", put_gamma_oi: "-50" },
      { strike: "230", call_gamma_oi: "100", put_gamma_oi: "-50" },
      { strike: "240", call_gamma_oi: "100", put_gamma_oi: "-50" },
    ];
    const series = buildStrikeSeries(rows);
    const visible = filterStrikeWindow(series, 217.55, 0.1);
    expect(visible.length).toBe(4);
    expect(visible[0].strike).toBe(200);
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
