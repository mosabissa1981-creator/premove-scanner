import { describe, expect, it } from "vitest";
import {
  BAR_HEIGHT_RATIO,
  buildUnifiedChartData,
  createBarYScale,
  createProfileYScale,
  createStrikeXScale,
  profileSeriesFromUnified,
  profileSeriesPoints,
  resolvePlotStrikeDomain,
  splitStrikeSeriesForChart,
  strikeDomainFromValues,
  strikeToPlotX,
  symmetricDomain,
} from "@/utils/chart-domain";

const PLOT_TOP = 44;
const PLOT_HEIGHT = 282;

describe("createStrikeXScale", () => {
  it("maps lower strikes left and higher strikes right", () => {
    const scale = createStrikeXScale(500, 900, 82, 556);
    expect(scale.toX(756)).toBeLessThan(scale.toX(800));
    expect(scale.toX(500)).toBeCloseTo(82, 4);
    expect(scale.toX(900)).toBeCloseTo(638, 4);
  });

  it("coerces numeric strings through the scale", () => {
    const scale = createStrikeXScale(500, 900, 0, 400);
    expect(scale.toX("756" as unknown as number)).toBeLessThan(scale.toX(800));
  });
});

describe("strikeDomainFromValues", () => {
  it("returns ascending min/max regardless of input order", () => {
    expect(strikeDomainFromValues([800, 505, 756])).toEqual({ domainMin: 505, domainMax: 800 });
  });
});

describe("symmetricDomain", () => {
  it("returns [-maxAbs, maxAbs] for asymmetric data", () => {
    const domain = symmetricDomain([-391.8e6, 1_291.7e6]);
    expect(domain.maxAbs).toBeCloseTo(1_291.7e6, -3);
    expect(domain.domainMin).toBeCloseTo(-domain.domainMax, -3);
  });
});

describe("createBarYScale", () => {
  it("maps bar extrema to the center band only", () => {
    const barMax = 3.56e6;
    const scale = createBarYScale([-barMax, 0, barMax], PLOT_TOP, PLOT_HEIGHT);
    const half = PLOT_HEIGHT * BAR_HEIGHT_RATIO;
    const zeroY = PLOT_TOP + PLOT_HEIGHT / 2;

    expect(scale.toY(barMax)).toBeCloseTo(zeroY - half, 4);
    expect(scale.toY(-barMax)).toBeCloseTo(zeroY + half, 4);
    expect(scale.toY(0)).toBeCloseTo(zeroY, 4);
  });
});

describe("createProfileYScale", () => {
  it("uses a symmetric domain centered on zero", () => {
    const profiles = [-391.8e6, 0, 1_291.7e6];
    const scale = createProfileYScale(profiles, PLOT_TOP, PLOT_HEIGHT);
    const maxAbs = 1_291.7e6;

    expect(scale.domainMin).toBeCloseTo(-maxAbs * (1 + 0.12), -3);
    expect(scale.domainMax).toBeCloseTo(maxAbs * (1 + 0.12), -3);
    expect(Math.abs(scale.domainMin)).toBeCloseTo(Math.abs(scale.domainMax), -3);
  });

  it("places zero on the same vertical center as the bar axis", () => {
    const barScale = createBarYScale([183.6e6], PLOT_TOP, PLOT_HEIGHT);
    const profileScale = createProfileYScale([-391.8e6, 0, 1_291.7e6], PLOT_TOP, PLOT_HEIGHT);

    expect(profileScale.toY(0)).toBeCloseTo(barScale.zeroY, 4);
    expect(profileScale.toY(0)).toBeCloseTo(PLOT_TOP + PLOT_HEIGHT / 2, 4);
  });

  it("maps symmetric domain extrema to the full plot height", () => {
    const profiles = [-391.8e6, 0, 1_291.7e6];
    const scale = createProfileYScale(profiles, PLOT_TOP, PLOT_HEIGHT);

    expect(scale.toY(scale.domainMax)).toBeCloseTo(PLOT_TOP, 4);
    expect(scale.toY(scale.domainMin)).toBeCloseTo(PLOT_TOP + PLOT_HEIGHT, 4);
  });

  it("does not compress billion-scale profile values into the bar band", () => {
    const barScale = createBarYScale([3.56e6], PLOT_TOP, PLOT_HEIGHT);
    const profileScale = createProfileYScale([0, 1_291.7e6], PLOT_TOP, PLOT_HEIGHT);

    const barPeakY = barScale.toY(3.56e6);
    const profilePeakY = profileScale.toY(1_291.7e6);

    expect(profilePeakY).toBeLessThan(barPeakY - 20);
  });
});

describe("profileSeriesPoints", () => {
  it("sorts and deduplicates strikes for the profile line", () => {
    const series = profileSeriesPoints([
      { strike: 270, profile: 100 },
      { strike: 250, profile: -20 },
      { strike: 270, profile: 200 },
    ]);
    expect(series.map((point) => point.strike)).toEqual([250, 270]);
    expect(series[1]?.profile).toBe(200);
  });
});

describe("strikeToPlotX", () => {
  it("matches createStrikeXScale.toX for profile path and reference lines", () => {
    const scale = createStrikeXScale(45, 80, 82, 556);
    expect(strikeToPlotX(65.5, 45, 80, 82, 556)).toBeCloseTo(scale.toX(65.5), 6);
    expect(strikeToPlotX(67.02, 45, 80, 82, 556)).toBeCloseTo(scale.toX(67.02), 6);
  });
});

describe("resolvePlotStrikeDomain", () => {
  it("uses dataMin/dataMax when at full zoom", () => {
    const bounds = { min: 45, max: 80 };
    const viewport = { min: 43, max: 90 };
    const domain = resolvePlotStrikeDomain(viewport, bounds, [50, 63, 67, 75]);
    expect(domain).toEqual({ domainMin: 50, domainMax: 75 });
  });

  it("uses the zoomed viewport when narrowed", () => {
    const bounds = { min: 45, max: 80 };
    const viewport = { min: 60, max: 70 };
    const domain = resolvePlotStrikeDomain(viewport, bounds, [62, 65, 68]);
    expect(domain).toEqual({ domainMin: 60, domainMax: 70 });
  });
});

describe("buildUnifiedChartData", () => {
  it("merges dense profile steps with sparse bar strikes on one strike axis", () => {
    const unified = buildUnifiedChartData(
      [
        { strike: 63.0, profile: -100 },
        { strike: 63.1, profile: -90 },
        { strike: 67.0, profile: 200 },
      ],
      [{ strike: 63, netGex: -500_000, callGex: 0, putGex: -500_000 }],
    );

    expect(unified.map((point) => point.strike)).toEqual([63, 63.1, 67]);
    expect(unified[0]?.netGex).toBe(-500_000);
    expect(unified[0]?.gammaProfile).toBe(-100);
    expect(unified[1]?.netGex).toBeNull();
    expect(unified[2]?.gammaProfile).toBe(200);
  });

  it("keeps wall coordinates on the same linear strike scale as bars and profile", () => {
    const unified = buildUnifiedChartData(
      [
        { strike: 60, profile: -50 },
        { strike: 63, profile: -80 },
        { strike: 67, profile: 120 },
        { strike: 70, profile: 40 },
      ],
      [
        { strike: 63, netGex: -1, callGex: 0, putGex: -1 },
        { strike: 67, netGex: 1, callGex: 1, putGex: 0 },
      ],
    );

    const scale = createStrikeXScale(60, 70, 0, 400);
    const bar63 = unified.find((point) => point.strike === 63);
    const bar67 = unified.find((point) => point.strike === 67);
    expect(bar63?.netGex).toBe(-1);
    expect(bar67?.netGex).toBe(1);

    const putWallX = scale.toX(63);
    const gammaFlipX = scale.toX(67);
    expect(scale.toX(bar63!.strike)).toBeCloseTo(putWallX, 4);
    expect(scale.toX(bar67!.strike)).toBeCloseTo(gammaFlipX, 4);
    expect(profileSeriesFromUnified(unified).map((point) => point.strike)).toEqual([
      60, 63, 67, 70,
    ]);
  });
});

describe("splitStrikeSeriesForChart", () => {
  it("splits merged rows into profile steps and real bar strikes", () => {
    const { profileCurve, barStrikes } = splitStrikeSeriesForChart([
      { strike: 63.1, callGex: 0, putGex: 0, netGex: 0, profile: 10 },
      { strike: 67, callGex: 1, putGex: 0, netGex: 1, profile: 20 },
    ]);
    expect(profileCurve).toHaveLength(2);
    expect(barStrikes).toHaveLength(1);
    expect(barStrikes[0]?.strike).toBe(67);
  });
});
