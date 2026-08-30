import { describe, expect, it } from "vitest";
import {
  BAR_HEIGHT_RATIO,
  createBarYScale,
  createProfileYScale,
  profileSeriesPoints,
} from "@/lib/gex-study/gex-chart-scales";

const PLOT_TOP = 44;
const PLOT_HEIGHT = 282;

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
