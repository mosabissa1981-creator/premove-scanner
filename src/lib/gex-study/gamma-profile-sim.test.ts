import { describe, expect, it } from "vitest";
import type { OptionChainLeg } from "@/lib/gex-study/gamma-profile-sim";
import {
  blackScholesGamma,
  dollarGammaExposure,
  gammaFlipFromSimulatedProfile,
  interpolateSimulatedProfile,
  simulateGammaProfile,
  totalGammaAtSpot,
} from "@/lib/gex-study/gamma-profile-sim";

/** AMZN-style toy chain from the Google Black-Scholes gamma profile example. */
const GOOGLE_EXAMPLE_CHAIN: OptionChainLeg[] = [
  { strike: 180, type: "P", oi: 12_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 200, type: "P", oi: 25_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 220, type: "P", oi: 40_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 230, type: "P", oi: 45_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 240, type: "P", oi: 55_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 250, type: "P", oi: 75_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 260, type: "C", oi: 35_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 270, type: "C", oi: 60_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 275, type: "C", oi: 90_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 290, type: "C", oi: 50_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 300, type: "C", oi: 65_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 320, type: "C", oi: 40_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
  { strike: 365, type: "C", oi: 15_000, iv: 0.25, expiry: "2026-09-29", dte: 30 },
];

describe("blackScholesGamma", () => {
  it("returns positive gamma for ATM options", () => {
    const gamma = blackScholesGamma(100, 100, 30 / 365, 0.04, 0.25);
    expect(gamma).toBeGreaterThan(0);
  });

  it("returns zero when time or volatility is non-positive", () => {
    expect(blackScholesGamma(100, 100, 0, 0.04, 0.25)).toBe(0);
    expect(blackScholesGamma(100, 100, 30 / 365, 0.04, 0)).toBe(0);
  });
});

describe("dollarGammaExposure", () => {
  it("negates puts and keeps calls positive", () => {
    const call = dollarGammaExposure(250, 270, 30 / 365, 0.04, 0.25, 10_000, "C");
    const put = dollarGammaExposure(250, 270, 30 / 365, 0.04, 0.25, 10_000, "P");
    expect(call).toBeGreaterThan(0);
    expect(put).toBeLessThan(0);
    expect(Math.abs(put)).toBeCloseTo(Math.abs(call), 0);
  });
});

describe("simulateGammaProfile", () => {
  it("crosses zero between put-heavy and call-heavy regions", () => {
    const stockPrice = 266;
    const profile = simulateGammaProfile(GOOGLE_EXAMPLE_CHAIN, stockPrice, {
      riskFreeRate: 0.04,
      defaultIv: 0.25,
      steps: 250,
      paddingPct: 0.45,
    });

    expect(profile.length).toBeGreaterThan(100);
    const negatives = profile.filter((point) => point.profile < 0);
    const positives = profile.filter((point) => point.profile > 0);
    expect(negatives.length).toBeGreaterThan(0);
    expect(positives.length).toBeGreaterThan(0);

    const flip = gammaFlipFromSimulatedProfile(profile, stockPrice);
    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(200);
    expect(flip!).toBeLessThan(stockPrice);
  });

  it("matches the Google example formula at a fixed simulated spot", () => {
    const spot = 250;
    let manual = 0;
    for (const leg of GOOGLE_EXAMPLE_CHAIN) {
      manual += dollarGammaExposure(spot, leg.strike, 30 / 365, 0.04, 0.25, leg.oi, leg.type);
    }
    const computed = totalGammaAtSpot(GOOGLE_EXAMPLE_CHAIN, spot, {
      riskFreeRate: 0.04,
      defaultIv: 0.25,
    });
    expect(computed).toBeCloseTo(manual, 4);
  });

  it("interpolates profile values onto bar strikes", () => {
    const stockPrice = 266;
    const profile = simulateGammaProfile(GOOGLE_EXAMPLE_CHAIN, stockPrice, { steps: 200 });
    const at240 = interpolateSimulatedProfile(profile, 240);
    const at275 = interpolateSimulatedProfile(profile, 275);
    expect(at240).not.toBeNull();
    expect(at275).not.toBeNull();
    expect(at275!).toBeGreaterThan(at240!);
  });
});
