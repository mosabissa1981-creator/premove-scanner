import { describe, expect, it } from "vitest";
import {
  buildChainSimulatedGammaProfile,
  buildCumsumProfileAtFlip,
  buildIsolatedRebaseAtFlip,
  buildLocalizedBarProfileAtFlip,
  buildProfileAtFlip,
  buildProfileAtFlipFromIsolated,
  computeGexWallsFromSeries,
  gammaFlipFromRawProfile,
  interpolateSeriesAtX,
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

describe("computeGexWallsFromSeries", () => {
  it("picks put wall by peak negative dollar GEX below spot (MSTR-like)", () => {
    const spot = 128.5;
    const series = [
      { strike: 95, netGex: -500_000 },
      { strike: 110, netGex: -1_000_000 },
      { strike: 125, netGex: -8_000_000 },
      { strike: 130, netGex: 12_000_000 },
      { strike: 140, netGex: 4_000_000 },
    ];
    const walls = computeGexWallsFromSeries(series, spot);
    expect(walls.putWall).toBe(125);
    expect(walls.callWall).toBe(130);
  });

  it("ignores shallow positive net GEX below spot when finding put wall", () => {
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
