/**
 * Shared GEX dual-axis chart presentation (SVG primitives + theme).
 * Used by every bars + profile chart in the project.
 */

export const GEX_CHART_AXIS = {
  left: "left",
  right: "right",
} as const;

export const GEX_CHART_THEME = {
  /** Top-of-chart level labels (Gamma Flip, Put Wall, Call Wall). */
  levelLabelColor: "#a1a1aa",
  profileLineColor: "#d4a853",
  profileAxisColor: "#d4a853",
  profileFillNegative: "#fee2e2",
  profileFillPositive: "#fef3c7",
  profileFillOpacity: 0.45,
  barPositive: "#34d399",
  barNegative: "#f87171",
  levelColors: {
    putWall: "#f87171",
    gammaFlip: "#d4a853",
    callWall: "#34d399",
    spot: "#3b82f6",
  },
} as const;

export interface ProfileFillPoint {
  strike: number;
  profile: number;
}

/** Split area fills at $0: soft pink below, soft amber above. */
export function buildProfileFillPolygons(
  points: ProfileFillPoint[],
  xForStrike: (strike: number) => number,
  yForProfile: (profile: number) => number,
  zeroY: number,
): { negative: string[]; positive: string[] } {
  if (points.length < 2) return { negative: [], positive: [] };

  const negative: string[] = [];
  const positive: string[] = [];

  const addQuad = (x1: number, y1: number, x2: number, y2: number, bucket: string[]) => {
    bucket.push(`${x1},${y1} ${x2},${y2} ${x2},${zeroY} ${x1},${zeroY}`);
  };

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const x0 = xForStrike(prev.strike);
    const x1 = xForStrike(curr.strike);
    const y0 = yForProfile(prev.profile);
    const y1 = yForProfile(curr.profile);

    if (prev.profile <= 0 && curr.profile <= 0) {
      addQuad(x0, y0, x1, y1, negative);
      continue;
    }
    if (prev.profile >= 0 && curr.profile >= 0) {
      addQuad(x0, y0, x1, y1, positive);
      continue;
    }

    const span = curr.profile - prev.profile;
    const ratio = span === 0 ? 0 : -prev.profile / span;
    const xc = x0 + ratio * (x1 - x0);

    if (prev.profile < 0) {
      addQuad(x0, y0, xc, zeroY, negative);
      addQuad(xc, zeroY, x1, y1, positive);
    } else {
      addQuad(x0, y0, xc, zeroY, positive);
      addQuad(xc, zeroY, x1, y1, negative);
    }
  }

  return { negative, positive };
}

export function formatChartMoney(value: number, signed = false): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
