import { describe, expect, it } from "vitest";
import {
  buildBidirectionalProfileAtFlip,
  buildProfileAtFlip,
  buildProfileAtFlipFromIsolated,
} from "@/utils/gamma-math";

describe("buildBidirectionalProfileAtFlip", () => {
  it("plunges negative left of flip through put-heavy strikes", () => {
    const localized = [-5e9, -3e9, -1e9, 2e9, 1e9, 3e9];
    const flipIndex = 2;
    const profile = buildBidirectionalProfileAtFlip(localized, flipIndex);

    expect(profile[flipIndex]).toBe(0);
    expect(profile[1]).toBeLessThan(0);
    expect(profile[0]).toBeLessThan(profile[1]!);
    expect(profile[3]).toBeGreaterThan(0);
    expect(profile[5]).toBeGreaterThan(profile[3]!);
  });

  it("matches strike-range profile when flip lands on a strike", () => {
    const xs = [330, 340, 350, 360];
    const localized = [-100, -50, 200, 100];
    const ranged = buildProfileAtFlip(xs, localized, 350);
    const indexed = buildBidirectionalProfileAtFlip(localized, 2);

    for (let i = 0; i < xs.length; i++) {
      expect(indexed[i]).toBeCloseTo(ranged.find((point) => point.x === xs[i])!.profile, 6);
    }
  });
});

describe("buildProfileAtFlip", () => {
  it("anchors profile at zero on the gamma flip price", () => {
    const profile = buildProfileAtFlip(
      [240, 248.42, 265, 270],
      [-20_000_000, -5_000_000, 183_000_000, 103_000_000],
      248.42,
    );
    const below = profile.find((point) => point.x === 240)?.profile ?? 0;
    const above = profile.find((point) => point.x === 265)?.profile ?? 0;
    expect(below).toBeLessThan(0);
    expect(above).toBeGreaterThan(0);
  });

  it("keeps profile negative below flip when flip sits between strikes", () => {
    const profile = buildProfileAtFlip(
      [330, 340, 350, 360],
      [-100, -50, 200, 100],
      345,
    );
    expect(profile.find((point) => point.x === 340)?.profile).toBeLessThan(0);
    expect(profile.find((point) => point.x === 330)?.profile).toBeLessThan(0);
    expect(profile.find((point) => point.x === 360)?.profile).toBeGreaterThan(0);
  });

  it("accumulates localized strike GEX instead of treating each bar as an isolated total", () => {
    const profile = buildProfileAtFlip(
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

describe("buildProfileAtFlipFromIsolated", () => {
  it("anchors isolated BS totals at zero on the gamma flip price", () => {
    const profile = buildProfileAtFlipFromIsolated(
      [240, 248.42, 265, 270],
      [-20_000_000, 0, 183_000_000, 103_000_000],
      248.42,
    );
    const atFlip = profile.find((point) => Math.abs(point.x - 248.42) < 0.01);
    expect(atFlip?.profile ?? profile[1]?.profile).toBeCloseTo(0, 0);
  });

  it("does not stack isolated totals into a billion-dollar cliff", () => {
    const profile = buildProfileAtFlipFromIsolated(
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
