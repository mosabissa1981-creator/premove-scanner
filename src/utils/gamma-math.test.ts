import { describe, expect, it } from "vitest";
import {
  buildCumsumProfileAtFlip,
  buildIsolatedRebaseAtFlip,
  buildProfileAtFlip,
  buildProfileAtFlipFromIsolated,
  rebaseProfileAtFlip,
} from "@/utils/gamma-math";

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
