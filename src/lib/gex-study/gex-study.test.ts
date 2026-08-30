import { describe, expect, it } from "vitest";
import {
  buildCumulativeProfileAtFlip,
  buildFlipAnchoredProfile,
  buildFlipSeries,
  buildProfileSourceSeries,
  buildStrikeSeries,
  computeGammaFlip,
  computeGammaFlipDeep,
  computeGammaFlipFromWindow,
  computeNetGexBarFlip,
  computeWallsFromSeries,
  filterStrikeWindow,
  hasUsableSpotStrikes,
  interpolateProfileAtStrike,
  parseOptionChainLegs,
  parseOptionContractRows,
  parseOsiOptionSymbol,
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

describe("parseOsiOptionSymbol", () => {
  it("extracts strike, type, and expiry from OSI symbols", () => {
    expect(parseOsiOptionSymbol("AMZN250919P00250000")).toEqual({
      type: "P",
      strike: 250,
      expiry: "2025-09-19",
    });
    expect(parseOsiOptionSymbol("AMZN250919C00275000")).toEqual({
      type: "C",
      strike: 275,
      expiry: "2025-09-19",
    });
  });
});

describe("parseOptionContractRows", () => {
  it("maps paginated contract rows with per-contract IV and expiry", () => {
    const legs = parseOptionContractRows(
      [
        {
          option_symbol: "AMZN250919P00250000",
          open_interest: 75000,
          implied_volatility: "0.28",
        },
        {
          option_symbol: "AMZN251017C00275000",
          open_interest: 90000,
          implied_volatility: "0.31",
        },
      ],
      undefined,
      new Map([
        ["2025-09-19", 20],
        ["2025-10-17", 48],
      ]),
    );

    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ strike: 250, type: "P", oi: 75_000, iv: 0.28, dte: 20 });
    expect(legs[1]).toMatchObject({ strike: 275, type: "C", oi: 90_000, iv: 0.31, dte: 48 });
  });
});

describe("parseOptionChainLegs", () => {
  it("maps enriched UW rows into simulation legs", () => {
    const legs = parseOptionChainLegs(
      [
        {
          strike: "250",
          expiry: "2026-09-19",
          type: "put",
          open_interest: "75000",
          iv: "0.28",
        },
        {
          strike: "275",
          expiry: "2026-09-19",
          option_type: "call",
          oi: 90000,
          implied_volatility: "27",
        },
        "AAPL250919C00180000",
      ],
      undefined,
      new Map([["2026-09-19", 30]]),
    );

    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ strike: 250, type: "P", oi: 75_000, iv: 0.28, dte: 30 });
    expect(legs[1]).toMatchObject({ strike: 275, type: "C", oi: 90_000, iv: 0.27, dte: 30 });
  });

  it("parses option_symbol when strike/expiry are omitted", () => {
    const legs = parseOptionChainLegs(
      [
        {
          option_symbol: "AMZN250919P00250000",
          open_interest: "42000",
          implied_volatility: "0.29",
        },
      ],
      undefined,
      new Map([["2025-09-19", 20]]),
    );
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ strike: 250, type: "P", oi: 42_000, iv: 0.29, dte: 20 });
  });

  it("filters by expiry when a single expiry is requested", () => {
    const legs = parseOptionChainLegs(
      [
        { strike: "250", expiry: "2026-09-19", type: "P", open_interest: "100" },
        { strike: "260", expiry: "2026-10-17", type: "C", open_interest: "200" },
      ],
      "2026-09-19",
    );
    expect(legs).toHaveLength(1);
    expect(legs[0]?.strike).toBe(250);
  });
});

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
  it("rebases full-chain cumulative to zero at gamma flip", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "200", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "220", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "235", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "250", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "270", call_gamma_oi: "150", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const flipSeries = buildFlipSeries(rows, 266);
    const gammaFlip = computeGammaFlipDeep(flipSeries, 266)!;
    const chart = buildCumulativeProfileAtFlip(series, 266, gammaFlip, flipSeries);
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
    const flipSeries = buildFlipSeries(rows, 266);
    const gammaFlip = computeGammaFlipDeep(flipSeries, 266)!;
    const chart = buildCumulativeProfileAtFlip(series, 266, gammaFlip, flipSeries);
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
  it("rebases profile to zero at gamma flip for OptionCharts-style display", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "240", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "250", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "255", call_gamma_oi: "0", put_gamma_oi: "-20" },
      { strike: "260", call_gamma_oi: "100", put_gamma_oi: "0" },
      { strike: "270", call_gamma_oi: "150", put_gamma_oi: "0" },
      { strike: "280", call_gamma_oi: "80", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const flipSeries = buildFlipSeries(rows, 266);
    const gammaFlip = computeGammaFlipDeep(flipSeries, 266)!;
    const chart = prepareChartStrikeSeries(series, 266, gammaFlip, flipSeries);
    const atFlip = interpolateProfileAtStrike(chart, gammaFlip);
    const below = interpolateProfileAtStrike(chart, 250);
    const above = interpolateProfileAtStrike(chart, 270);
    expect(atFlip).toBeCloseTo(0, 0);
    expect(below).toBeLessThan(0);
    expect(above).toBeGreaterThan(0);
  });

  it("keeps negative profile below flip after rebase", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "330", call_gamma_oi: "0", put_gamma_oi: "-100" },
      { strike: "340", call_gamma_oi: "0", put_gamma_oi: "-50" },
      { strike: "350", call_gamma_oi: "200", put_gamma_oi: "0" },
      { strike: "360", call_gamma_oi: "100", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 355);
    const flipSeries = buildFlipSeries(rows, 355);
    const gammaFlip = computeGammaFlipDeep(flipSeries, 355)!;
    const chart = prepareChartStrikeSeries(series, 355, gammaFlip, flipSeries);
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

  it("shows positive profile above an OI flip when rebased cumulative rises above flip", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "5", call_gamma_oi: "0", put_gamma_oi: "-500000" },
      { strike: "50", call_gamma_oi: "0", put_gamma_oi: "-300000" },
      { strike: "100", call_gamma_oi: "0", put_gamma_oi: "-200000" },
      { strike: "150", call_gamma_oi: "0", put_gamma_oi: "-150000" },
      { strike: "200", call_gamma_oi: "0", put_gamma_oi: "-100000" },
      { strike: "240", call_gamma_oi: "0", put_gamma_oi: "-20000" },
      { strike: "242.5", call_gamma_oi: "120000", put_gamma_oi: "0" },
      { strike: "245", call_gamma_oi: "0", put_gamma_oi: "-5000" },
      { strike: "260", call_gamma_oi: "100000", put_gamma_oi: "0" },
      { strike: "275", call_gamma_oi: "150000", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const profileSource = buildProfileSourceSeries(rows);
    const gammaFlip = 238.2;
    const chart = prepareChartStrikeSeries(series, 266, gammaFlip, profileSource);
    expect(interpolateProfileAtStrike(chart, gammaFlip)!).toBeCloseTo(0, 0);
    expect(interpolateProfileAtStrike(chart, 245)!).toBeGreaterThan(0);
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

  it("prefers a deeper nearby OI flip for AMZN-style charts", () => {
    const flip = pickAllExpiryGammaFlip(263, 256.86, null, 266.43, {
      call_wall: "275",
      put_wall: "250",
      gamma_flip: "256.86",
      gamma_magnet: null,
      nearby_flips: ["238.20", "256.86"],
    });
    expect(flip).toBeCloseTo(238.2, 1);
  });

  it("selects OI flip 238 for AMZN when profile zero crossing is near 263", () => {
    const profileFlip = 263.54;
    const spot = 266.43;
    const flip = pickAllExpiryGammaFlip(
      profileFlip,
      256.86,
      null,
      spot,
      {
        call_wall: "275",
        put_wall: "265",
        gamma_flip: "256.86",
        gamma_magnet: null,
        nearby_flips: ["238.20", "256.86"],
      },
    );
    expect(flip).toBeCloseTo(238.2, 1);
    expect(flip!).toBeLessThan(profileFlip);
  });

  it("uses the deepest vol flip when it is below the OI headline flip", () => {
    const flip = pickAllExpiryGammaFlip(
      248.42,
      248.42,
      null,
      266.43,
      {
        call_wall: "275",
        put_wall: "265",
        gamma_flip: "248.42",
        gamma_magnet: null,
        nearby_flips: ["256.86"],
      },
      {
        call_wall: "275",
        put_wall: "265",
        gamma_flip: "248.42",
        gamma_magnet: null,
        nearby_flips: ["238.20"],
      },
    );
    expect(flip).toBeCloseTo(238.2, 1);
  });

  it("keeps profile and bar magnitudes aligned after chart prep", () => {
    const rows: UwSpotExposureStrikeRow[] = [
      { strike: "200", call_gamma_oi: "0", put_gamma_oi: "-50000000" },
      { strike: "240", call_gamma_oi: "0", put_gamma_oi: "-20000000" },
      { strike: "260", call_gamma_oi: "100000000", put_gamma_oi: "0" },
      { strike: "275", call_gamma_oi: "150000000", put_gamma_oi: "0" },
    ];
    const series = buildStrikeSeries(rows, 266);
    const profileSource = buildProfileSourceSeries(rows);
    const chart = prepareChartStrikeSeries(series, 266, 238.2, profileSource);
    const maxBar = Math.max(...chart.map((point) => Math.abs(point.netGex)));
    const maxProfile = Math.max(...chart.map((point) => Math.abs(point.profile)));
    expect(maxProfile).toBeGreaterThan(maxBar * 0.01);
    expect(maxProfile).toBeLessThan(maxBar * 1000);
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
