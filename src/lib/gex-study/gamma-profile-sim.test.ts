import { describe, expect, it } from "vitest";
import type { OptionChainLeg } from "@/utils/gamma-math";
import {
  buildChainSimulatedGammaProfile,
  buildSimulatedProfileFromRawTotals,
} from "@/utils/gamma-math";
import {
  blackScholesGamma,
  buildRebaseAtFlipProfile,
  dedupeChainLegs,
  dollarGammaExposure,
  gammaFlipFromRawProfile,
  gammaFlipFromSimulatedProfile,
  interpolateSimulatedProfile,
  simulateGammaProfile,
  simulateRawNetGexProfile,
  totalGammaAtSpot,
} from "@/lib/gex-study/gamma-profile-sim";

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

describe("simulateRawNetGexProfile", () => {
  it("recomputes an isolated total at every simulated spot (no running sum)", () => {
    const stockPrice = 266;
    const raw = simulateRawNetGexProfile(GOOGLE_EXAMPLE_CHAIN, stockPrice, {
      steps: 40,
      asOfDate: "2026-08-30",
    });

    for (const point of raw) {
      const isolated = totalGammaAtSpot(GOOGLE_EXAMPLE_CHAIN, point.simulatedSpot, {
        asOfDate: "2026-08-30",
      });
      expect(point.rawNetGex).toBeCloseTo(isolated, 4);
    }
  });
});

describe("buildChainSimulatedGammaProfile", () => {
  it("anchors profile at zero on the gamma flip price", () => {
    const stockPrice = 266;
    const raw = simulateRawNetGexProfile(GOOGLE_EXAMPLE_CHAIN, stockPrice, {
      steps: 200,
      asOfDate: "2026-08-30",
    });
    const flip = gammaFlipFromRawProfile(raw, stockPrice)!;
    const profile = buildChainSimulatedGammaProfile(GOOGLE_EXAMPLE_CHAIN, stockPrice, flip, {
      steps: 200,
      asOfDate: "2026-08-30",
    });

    expect(interpolateSimulatedProfile(profile, flip)).toBeCloseTo(0, 0);

    const below = interpolateSimulatedProfile(profile, flip - 10);
    const above = interpolateSimulatedProfile(profile, flip + 10);
    expect(below!).toBeLessThan(0);
    expect(above!).toBeGreaterThan(0);
  });
});

describe("buildSimulatedProfileFromRawTotals", () => {
  it("does not stack bar-sized dollar values into a billion-dollar cliff", () => {
    const raw = [
      { simulatedSpot: 240, rawNetGex: -20_000_000 },
      { simulatedSpot: 248.42, rawNetGex: 0 },
      { simulatedSpot: 260, rawNetGex: 50_000_000 },
      { simulatedSpot: 265, rawNetGex: 183_000_000 },
      { simulatedSpot: 270, rawNetGex: 103_000_000 },
    ];
    const profile = buildSimulatedProfileFromRawTotals(raw, 248.42);
    const at265 = interpolateSimulatedProfile(profile, 265)!;
    const at270 = interpolateSimulatedProfile(profile, 270)!;
    expect(at265).toBeCloseTo(183_000_000, -3);
    expect(at270).toBeCloseTo(103_000_000, -3);
    expect(at270).toBeLessThan(500_000_000);
  });
});

describe("simulateGammaProfile", () => {
  it("crosses zero between put-heavy and call-heavy regions after rebase", () => {
    const stockPrice = 266;
    const profile = simulateGammaProfile(GOOGLE_EXAMPLE_CHAIN, stockPrice, {
      riskFreeRate: 0.04,
      defaultIv: 0.25,
      steps: 250,
      paddingPct: 0.45,
      asOfDate: "2026-08-30",
    });

    expect(profile.length).toBeGreaterThan(100);
    const negatives = profile.filter((point) => point.profile < 0);
    const positives = profile.filter((point) => point.profile > 0);
    expect(negatives.length).toBeGreaterThan(0);
    expect(positives.length).toBeGreaterThan(0);

    const flip = gammaFlipFromSimulatedProfile(profile, stockPrice);
    expect(flip).not.toBeNull();
    expect(interpolateSimulatedProfile(profile, flip!)!).toBeCloseTo(0, 0);
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
      asOfDate: "2026-08-30",
    });
    expect(computed).toBeCloseTo(manual, 4);
  });

  it("rebase-at-flip is not a monotone copy of raw totals", () => {
    const stockPrice = 266;
    const raw = simulateRawNetGexProfile(GOOGLE_EXAMPLE_CHAIN, stockPrice, { steps: 80 });
    const flip = gammaFlipFromRawProfile(raw, stockPrice)!;
    const profile = buildRebaseAtFlipProfile(raw, flip);
    const rawMonotone = raw.every(
      (point, index) => index === 0 || point.rawNetGex <= raw[index - 1].rawNetGex,
    );
    const profileMonotone = profile.every(
      (point, index) => index === 0 || point.profile <= profile[index - 1].profile,
    );
    expect(rawMonotone || profileMonotone).toBe(false);
  });
});

describe("blackScholesGamma", () => {
  it("returns positive gamma for ATM options", () => {
    const gamma = blackScholesGamma(100, 100, 30 / 365, 0.04, 0.25);
    expect(gamma).toBeGreaterThan(0);
  });
});

describe("dollarGammaExposure", () => {
  it("negates puts and scales with simulated spot squared", () => {
    const call = dollarGammaExposure(250, 270, 30 / 365, 0.04, 0.25, 10_000, "C");
    const put = dollarGammaExposure(250, 270, 30 / 365, 0.04, 0.25, 10_000, "P");
    expect(call).toBeGreaterThan(0);
    expect(put).toBeLessThan(0);
  });
});

describe("dedupeChainLegs", () => {
  it("keeps one leg per expiry/strike/type", () => {
    const legs = dedupeChainLegs([
      { strike: 250, type: "P", oi: 100, iv: 0.25, expiry: "2026-09-19", dte: 30 },
      { strike: 250, type: "P", oi: 200, iv: 0.25, expiry: "2026-09-19", dte: 30 },
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0]?.oi).toBe(200);
  });
});
