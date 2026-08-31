import { describe, expect, it } from "vitest";
import {
  buildChainSimulatedGammaProfile,
  buildCumsumProfileAtFlip,
  buildIsolatedRebaseAtFlip,
  buildLocalizedBarProfileAtFlip,
  buildProfileAtFlip,
  buildProfileAtFlipFromIsolated,
  computeGexWallsFromSeries,
  defaultRiskFreeRate,
  filterLegsByMaxDte,
  filterLegsForOdte,
  gammaFlipFromRawProfile,
  interpolateSeriesAtX,
  MAX_GEX_PROFILE_DTE,
  rebaseProfileAtFlip,
  simulateRawNetGexProfile,
  type OptionChainLeg,
} from "@/utils/gamma-math";

describe("buildChainSimulatedGammaProfile", () => {
  const CHAIN: OptionChainLeg[] = [
    { strike: 250, type: "P", oi: 75_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
    { strike: 260, type: "C", oi: 35_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
    { strike: 275, type: "C", oi: 90_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  ];

  it("builds ticker-agnostic isolated BS profile rebased at flip", () => {
    const stockPrice = 266;
    const raw = simulateRawNetGexProfile(CHAIN, stockPrice, { steps: 80, asOfDate: "2026-08-30" });
    const flip = gammaFlipFromRawProfile(raw, stockPrice)!;
    const profile = buildChainSimulatedGammaProfile(CHAIN, stockPrice, flip, {
      steps: 80,
      asOfDate: "2026-08-30",
    });

    expect(profile.length).toBeGreaterThan(10);
    const xs = profile.map((point) => point.simulatedSpot);
    const values = profile.map((point) => point.profile);
    expect(interpolateSeriesAtX(xs, values, flip)).toBeCloseTo(0, 0);
  });

  it("never applies cumsum to BS simulation totals", () => {
    const stockPrice = 266;
    const flip = 260;
    const profile = buildChainSimulatedGammaProfile(CHAIN, stockPrice, flip, {
      steps: 5,
      asOfDate: "2026-08-30",
    });
    const raw = simulateRawNetGexProfile(CHAIN, stockPrice, { steps: 5, asOfDate: "2026-08-30" });

    let running = 0;
    const cumsumProfile = buildLocalizedBarProfileAtFlip(
      raw.map((point) => point.simulatedSpot),
      raw.map((point) => point.rawNetGex),
      flip,
    );

    expect(profile[profile.length - 1]?.profile).not.toBeCloseTo(
      cumsumProfile[cumsumProfile.length - 1]?.profile ?? 0,
      -3,
    );
  });
});

describe("buildLocalizedBarProfileAtFlip", () => {
  it("delegates to cumsum for bar-localized GEX only", () => {
    const xs = [330, 340, 350, 360];
    const localized = [-100, -50, 200, 100];
    const bar = buildLocalizedBarProfileAtFlip(xs, localized, 345);
    const cumsum = buildCumsumProfileAtFlip(xs, localized, 345);
    for (const point of bar) {
      const match = cumsum.find((row) => row.x === point.x);
      expect(point.profile).toBeCloseTo(match?.profile ?? 0, 6);
    }
  });
});

describe("buildCumsumProfileAtFlip", () => {
  it("anchors localized bar cumsum at zero on the gamma flip price", () => {
    const profile = buildCumsumProfileAtFlip(
      [240, 248.42, 265, 270],
      [-20_000_000, -5_000_000, 183_000_000, 103_000_000],
      248.42,
    );
    const atFlip = profile.find((point) => Math.abs(point.x - 248.42) < 0.01);
    expect(atFlip?.profile ?? 0).toBeCloseTo(0, 0);
    const above = profile.find((point) => point.x === 265)?.profile ?? 0;
    expect(above).toBeGreaterThan(0);
  });

  it("integrates left-to-right without bidirectional air pockets at put wall", () => {
    const localized = [-5e9, -3e9, -1e9, 2e9, 1e9, 3e9];
    const xs = [700, 720, 740, 760, 780, 800];
    const profile = buildCumsumProfileAtFlip(xs, localized, 772);
    const atPutWall = profile.find((point) => point.x === 760)?.profile ?? 0;
    const atFlip = interpolateAt(profile, 772);

    expect(atFlip).toBeCloseTo(0, 0);
    expect(atPutWall).toBeLessThan(atFlip);
  });

  it("accumulates localized strike GEX via cumsum", () => {
    const profile = buildCumsumProfileAtFlip(
      [240, 248.42, 260, 265, 270],
      [-20_000_000, 0, 50_000_000, 183_000_000, 103_000_000],
      248.42,
    );
    const at265 = profile.find((point) => point.x === 265)?.profile ?? 0;
    const at270 = profile.find((point) => point.x === 270)?.profile ?? 0;
    expect(at265).toBeCloseTo(233_000_000, -3);
    expect(at270).toBeCloseTo(336_000_000, -3);
  });
});

describe("buildIsolatedRebaseAtFlip", () => {
  it("anchors isolated BS totals at zero on the gamma flip price", () => {
    const profile = buildIsolatedRebaseAtFlip(
      [240, 248.42, 265, 270],
      [-20_000_000, 0, 183_000_000, 103_000_000],
      248.42,
    );
    const atFlip = profile.find((point) => Math.abs(point.x - 248.42) < 0.01);
    expect(atFlip?.profile ?? 0).toBeCloseTo(0, 0);
    const below = profile.find((point) => point.x === 240)?.profile ?? 0;
    const above = profile.find((point) => point.x === 265)?.profile ?? 0;
    expect(below).toBeLessThan(0);
    expect(above).toBeGreaterThan(0);
  });

  it("does not stack isolated totals into a billion-dollar cliff", () => {
    const profile = buildIsolatedRebaseAtFlip(
      [240, 248.42, 260, 265, 270],
      [-20_000_000, 0, 50_000_000, 183_000_000, 103_000_000],
      248.42,
    );
    const at265 = profile.find((point) => point.x === 265)?.profile ?? 0;
    const at270 = profile.find((point) => point.x === 270)?.profile ?? 0;
    expect(at265).toBeCloseTo(183_000_000, -3);
    expect(at270).toBeCloseTo(103_000_000, -3);
    expect(at270).toBeLessThan(500_000_000);
  });
});

describe("buildProfileAtFlip", () => {
  it("delegates localized bars to cumsum profile", () => {
    const xs = [330, 340, 350, 360];
    const localized = [-100, -50, 200, 100];
    const cumsum = buildCumsumProfileAtFlip(xs, localized, 345);
    const profile = buildProfileAtFlip(xs, localized, 345);
    for (const point of profile) {
      const match = cumsum.find((row) => row.x === point.x);
      expect(point.profile).toBeCloseTo(match?.profile ?? 0, 6);
    }
  });
});

describe("buildProfileAtFlipFromIsolated", () => {
  it("delegates BS simulation totals to isolated rebase", () => {
    const xs = [240, 248.42, 265, 270];
    const totals = [-20_000_000, 0, 183_000_000, 103_000_000];
    const isolated = buildIsolatedRebaseAtFlip(xs, totals, 248.42);
    const profile = buildProfileAtFlipFromIsolated(xs, totals, 248.42);
    for (const point of profile) {
      const match = isolated.find((row) => row.x === point.x);
      expect(point.profile).toBeCloseTo(match?.profile ?? 0, 6);
    }
  });
});

describe("rebaseProfileAtFlip", () => {
  it("delegates to isolated rebase for backward compatibility", () => {
    const xs = [240, 248.42, 265, 270];
    const values = [-20_000_000, 0, 183_000_000, 103_000_000];
    const rebased = rebaseProfileAtFlip(xs, values, 248.42);
    const isolated = buildIsolatedRebaseAtFlip(xs, values, 248.42);
    for (const point of rebased) {
      const match = isolated.find((row) => row.x === point.x);
      expect(point.profile).toBeCloseTo(match?.profile ?? 0, 6);
    }
  });
});

describe("filterLegsByMaxDte", () => {
  it("drops LEAP legs beyond 120 DTE", () => {
    const legs: OptionChainLeg[] = [
      { strike: 125, type: "P", oi: 10_000, iv: 0.4, expiry: "2026-09-19", dte: 20 },
      { strike: 130, type: "C", oi: 12_000, iv: 0.4, expiry: "2026-09-19", dte: 20 },
      { strike: 140, type: "C", oi: 8_000, iv: 0.35, expiry: "2027-01-15", dte: 140 },
    ];
    const filtered = filterLegsByMaxDte(legs, MAX_GEX_PROFILE_DTE);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((leg) => leg.dte <= 120)).toBe(true);
  });

  it("keeps original legs when every expiry is beyond the max DTE", () => {
    const leaps: OptionChainLeg[] = [
      { strike: 130, type: "C", oi: 5_000, iv: 0.3, expiry: "2027-06-18", dte: 290 },
    ];
    expect(filterLegsByMaxDte(leaps)).toEqual(leaps);
  });
});

describe("filterLegsForOdte", () => {
  it("keeps only contracts expiring on the trading date", () => {
    const legs: OptionChainLeg[] = [
      { strike: 100, type: "C", oi: 10, iv: 0.3, expiry: "2026-08-31", dte: 0 },
      { strike: 105, type: "P", oi: 12, iv: 0.35, expiry: "2026-09-05", dte: 5 },
    ];
    expect(filterLegsForOdte(legs, "2026-08-31")).toEqual([legs[0]]);
  });
});

describe("defaultRiskFreeRate", () => {
  it("uses 5% to align with current Treasury-style platform defaults", () => {
    expect(defaultRiskFreeRate()).toBe(0.05);
  });
});

describe("simulateRawNetGexProfile DTE filter", () => {
  it("excludes LEAP legs from the simulated profile by default", () => {
    const near: OptionChainLeg[] = [
      { strike: 120, type: "P", oi: 50_000, iv: 0.4, expiry: "2026-09-19", dte: 20 },
      { strike: 130, type: "C", oi: 50_000, iv: 0.4, expiry: "2026-09-19", dte: 20 },
    ];
    const withLeap: OptionChainLeg[] = [
      ...near,
      { strike: 200, type: "C", oi: 200_000, iv: 0.35, expiry: "2027-01-15", dte: 150 },
    ];
    const base = simulateRawNetGexProfile(near, 128, {
      steps: 40,
      asOfDate: "2026-08-30",
    });
    const filtered = simulateRawNetGexProfile(withLeap, 128, {
      steps: 40,
      asOfDate: "2026-08-30",
    });
    expect(filtered).toHaveLength(base.length);
    for (let i = 0; i < base.length; i++) {
      expect(filtered[i]?.rawNetGex).toBeCloseTo(base[i]?.rawNetGex ?? 0, 4);
    }
  });
});

describe("computeGexWallsFromSeries", () => {
  it("picks put wall by peak |negative| put dollar GEX (MSTR-like OI trap)", () => {
    const spot = 128.5;
    // Strike 90: huge OI-style put mass but modest dollar GEX after gamma weight.
    // Strike 125: smaller OI but peak |putGex| near spot — OptionCharts put wall.
    const series = [
      { strike: 90, netGex: -6_000_000, callGex: 0, putGex: -6_000_000 },
      { strike: 95, netGex: -500_000, callGex: 0, putGex: -500_000 },
      { strike: 125, netGex: -5_000_000, callGex: 7_000_000, putGex: -12_000_000 },
      { strike: 130, netGex: 12_000_000, callGex: 14_000_000, putGex: -2_000_000 },
      { strike: 140, netGex: 4_000_000, callGex: 4_500_000, putGex: -500_000 },
    ];
    const walls = computeGexWallsFromSeries(series, spot);
    expect(walls.putWall).toBe(125);
    expect(walls.callWall).toBe(130);
  });

  it("falls back to net GEX peaks when putGex/callGex are absent", () => {
    const series = [
      { strike: 50, netGex: 80_000 },
      { strike: 55, netGex: 50_000 },
      { strike: 60, netGex: -30_000 },
      { strike: 70, netGex: 140_000 },
      { strike: 75, netGex: 195_000 },
    ];
    const walls = computeGexWallsFromSeries(series, 64);
    expect(walls.putWall).toBe(60);
    expect(walls.callWall).toBe(75);
  });

  it("does not prefer a less-negative net bar over peak |putGex|", () => {
    // Net at 90 is more negative than net at 125 (call GEX offsets puts at 125),
    // but put-side dollar GEX peaks at 125 — that is the structural put wall.
    const walls = computeGexWallsFromSeries(
      [
        { strike: 90, netGex: -8_000_000, callGex: 0, putGex: -8_000_000 },
        { strike: 125, netGex: -3_000_000, callGex: 9_000_000, putGex: -12_000_000 },
        { strike: 130, netGex: 15_000_000, callGex: 15_000_000, putGex: 0 },
      ],
      129,
    );
    expect(walls.putWall).toBe(125);
    expect(walls.callWall).toBe(130);
  });
});

function interpolateAt(
  profile: { x: number; profile: number }[],
  x: number,
): number {
  const sorted = [...profile].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0].profile;
  const last = sorted[sorted.length - 1];
  if (x >= last.x) return last.profile;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (x < prev.x || x > curr.x) continue;
    const span = curr.x - prev.x;
    if (span === 0) return curr.profile;
    const ratio = (x - prev.x) / span;
    return prev.profile + ratio * (curr.profile - prev.profile);
  }
  return last.profile;
}
