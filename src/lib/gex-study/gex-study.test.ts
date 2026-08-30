import { describe, expect, it } from "vitest";
import {
  buildCumulativeProfileAtFlip,
  buildFlipAnchoredProfile,
  buildStrikeSeries,
  computeGammaFlip,
  computeGammaFlipDeep,
  computeGammaFlipFromWindow,
  computeNetGexBarFlip,
  computeWallsFromSeries,
  filterStrikeWindow,
  hasUsableSpotStrikes,
  interpolateProfileAtStrike,
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

  it("uses full-chain cumulative when finding flip near spot", () => {
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

describe("buildCumulativeProfileAtFlip", () => {
  it("accumulates full-chain bar volume with profile zero near gamma flip", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "200", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "220", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "235", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "250", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "270", call_gamma_oi: "150", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const gammaFlip = computeGammaFlipFromWindow(series, 266)!;
    const chart = buildCumulativeProfileAtFlip(series, 266, gammaFlip);
    expect(interpolateProfileAtStrike(chart, 220)!).toBeLessThan(0);
    expect(interpolateProfileAtStrike(chart, 270)!).toBeGreaterThan(0);
    expect(interpolateProfileAtStrike(chart, gammaFlip)!).toBeCloseTo(0, 0);
    expect(interpolateProfileAtStrike(chart, 270)!).toBeGreaterThan(
      interpolateProfileAtStrike(chart, 250)!,
    );
  });

  it("uses full-chain cumulative so profile dips negative below flip like OptionCharts", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "150", call_gamma_oi: "0", put_gamma_oi: "-30" },
      { strike: "170", call_gamma_oi: "0", put_gamma_oi: "-30" },
      { strike: "190", call_gamma_oi: "0", put_gamma_oi: "-30" },
      { strike: "210", call_gamma_oi: "0", put_gamma_oi: "-30" },
      { strike: "230", call_gamma_oi: "0", put_gamma_oi: "-30" },
      { strike: "235", call_gamma_oi: "0", put_gamma_oi: "-20" },
      { strike: "245", call_gamma_oi: "0", put_gamma_oi: "-10" },
      { strike: "255", call_gamma_oi: "120", put_gamma_oi: "0" },
      { strike: "275", call_gamma_oi: "150", put_gamma_oi: "0" },
      { strike: "290", call_gamma_oi: "80", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const chart = buildCumulativeProfileAtFlip(series, 266, 238.2);
    const at220 = interpolateProfileAtStrike(chart, 220)!;
    const at245 = interpolateProfileAtStrike(chart, 245)!;
    const at275 = interpolateProfileAtStrike(chart, 275)!;
    expect(at220).toBeLessThan(0);
    expect(at245).toBeLessThan(0);
    expect(at275).toBeGreaterThan(0);
    expect(chart.find((point) => point.strike === 245)?.netGex).toBeLessThan(0);
  });
});

describe("buildFlipAnchoredProfile", () => {
  it("anchors profile at zero on the gamma flip strike", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "330", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "340", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "350", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "360", call_gamma_oi: "100", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 355);
    const chart = buildFlipAnchoredProfile(series, 355, 345);
    const below = chart.find((point) => point.strike === 340);
    const above = chart.find((point) => point.strike === 360);
    const anchor = chart.find((point) => Math.abs(point.strike - 345) < 1e-6);
    expect(below?.profile).toBeLessThan(0);
    expect(above?.profile).toBeGreaterThan(0);
    expect(anchor?.profile).toBe(0);
  });
});

describe("computeNetGexBarFlip", () => {
  it("finds the strike where bars change from red to green", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "240", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "250", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "255", call_gamma_oi: "0", put_gamma_oi: "-20" },
      { strike: "260", call_gamma_oi: "100", put_gamma_oi: "0" },
      { strike: "270", call_gamma_oi: "150", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const flip = computeNetGexBarFlip(series, 266);
    expect(flip).toBeGreaterThan(255);
    expect(flip).toBeLessThan(260);
  });
});

describe("prepareChartStrikeSeries", () => {
  it("anchors profile zero at gamma flip for a smooth flip-anchored curve", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "240", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "250", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "255", call_gamma_oi: "0", put_gamma_oi: "-20" },
      { strike: "260", call_gamma_oi: "100", put_gamma_oi: "0" },
      { strike: "270", call_gamma_oi: "150", put_gamma_oi: "0" },
      { strike: "280", call_gamma_oi: "80", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const gammaFlip = computeGammaFlipFromWindow(series, 266)!;
    const chart = prepareChartStrikeSeries(series, 266, gammaFlip, "spot");
    const atFlip = interpolateProfileAtStrike(chart, gammaFlip);
    const below = interpolateProfileAtStrike(chart, 250);
    const above = interpolateProfileAtStrike(chart, 270);
    expect(atFlip).toBeCloseTo(0, 0);
    expect(below).toBeLessThan(0);
    expect(above).toBeGreaterThan(0);
  });

  it("uses flip-anchored profile when cumulative data does not cross at the flip", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "330", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "340", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "350", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "360", call_gamma_oi: "100", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 355);
    const gammaFlip = computeGammaFlipFromWindow(series, 355)!;
    const chart = prepareChartStrikeSeries(series, 355, gammaFlip, "greek");
    const below = chart.find((point) => point.strike === 340);
    const above = chart.find((point) => point.strike === 360);
    expect(below?.profile).toBeLessThan(0);
    expect(above?.profile).toBeGreaterThan(0);
    expect(interpolateProfileAtStrike(chart, gammaFlip)!).toBeCloseTo(0, 0);
  });

  it("rebases profile when gamma flip is unavailable", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "150", call_gamma_oi: "100", put_gamma_oi: "-50" },
      { strike: "180", call_gamma_oi: "50", put_gamma_oi: "-200" },
      { strike: "195", call_gamma_oi: "20", put_gamma_oi: "-80" },
      { strike: "200", call_gamma_oi: "-30", put_gamma_oi: "-20" },
      { strike: "210", call_gamma_oi: "-40", put_gamma_oi: "0" },
      { strike: "220", call_gamma_oi: "-20", put_gamma_oi: "-10" },
      { strike: "230", call_gamma_oi: "-10", put_gamma_oi: "-5" },
    ];
    const series = buildStrikeSeries(rows);
    const chart = prepareChartStrikeSeries(series, 217.55);
    expect(chart[0]?.strike).toBeGreaterThanOrEqual(150);
    expect(chart[0]?.profile).toBe(0);
  });
});

describe("pickAllExpiryGammaFlip", () => {
  it("uses the ATM profile flip for TSLA instead of a deep junk crossing", () => {
    const flip = pickAllExpiryGammaFlip(344.28, 344.28, 336.4, 348.75);
    expect(flip).toBeCloseTo(344.28, 1);
  });

  it("uses UW OI flip when profile flip is unavailable", () => {
    const flip = pickAllExpiryGammaFlip(null, 344.28, 336.4, 348.75);
    expect(flip).toBeCloseTo(344.28, 1);
  });

  it("prefers UW levels when profile is a deep outlier on greek fallback data", () => {
    const flip = pickAllExpiryGammaFlip(230, 344.28, 336.4, 348.75);
    expect(flip).toBeCloseTo(344.28, 1);
  });

  it("prefers the deeper vol flip for MSFT when OI profile is nearer to spot", () => {
    const flip = pickAllExpiryGammaFlip(492.51, 492.51, 404.27, 513.15);
    expect(flip).toBeCloseTo(404.27, 1);
  });

  it("keeps the deeper NVDA flip when both profile and OI are valid", () => {
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
