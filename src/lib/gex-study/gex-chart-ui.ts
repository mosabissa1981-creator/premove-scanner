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

export const GEX_CHART_LAYOUT = {
  /** Vertical gap between background axis tick row and reference badges (Recharts dy≈10). */
  referenceBadgeDy: 18,
  /** Skip axis ticks within this many strike points of a wall/spot label. */
  axisTickClearanceStrikes: 2.5,
  /** Preferred round-number step for background axis ticks. */
  axisTickStep: 5,
} as const;

/**
 * Background X-axis strike ticks that avoid colliding with wall/spot reference badges.
 * Returns an empty list when `showTicks` is false (badges-only mode).
 */
export function computeBackgroundStrikeTicks(
  strikeMin: number,
  strikeMax: number,
  reservedStrikes: number[],
  options?: {
    step?: number;
    clearance?: number;
    showTicks?: boolean;
  },
): number[] {
  if (options?.showTicks === false) return [];

  const step = options?.step ?? GEX_CHART_LAYOUT.axisTickStep;
  const clearance = options?.clearance ?? GEX_CHART_LAYOUT.axisTickClearanceStrikes;
  const min = Math.min(strikeMin, strikeMax);
  const max = Math.max(strikeMin, strikeMax);

  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let tick = first; tick <= max; tick += step) {
    const blocked = reservedStrikes.some(
      (level) => Number.isFinite(level) && Math.abs(level - tick) < clearance,
    );
    if (!blocked) ticks.push(tick);
  }
  return ticks;
}

export function formatChartMoney(value: number, signed = false): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Label collision / de-confliction (vertical level labels + bottom badges)
// ---------------------------------------------------------------------------

export interface LineLabelAnchor {
  key: string;
  x: number;
}

export interface LineLabelLayout {
  key: string;
  x: number;
  dx: number;
  /** SVG rotate angle (OptionCharts-style vertical labels). */
  rotate: number;
}

export interface BottomBadgeInput {
  key: string;
  x: number;
  text: string;
  color: string;
  pill?: boolean;
  fontWeight?: string;
}

export interface ResolvedBottomBadge extends BottomBadgeInput {
  y: number;
  /** Horizontal nudge from the reference-line x position. */
  dx: number;
}

const DEFAULT_LINE_LABEL_GAP_PX = 5;
const DEFAULT_LINE_LABEL_SPLIT_PX = 12;
const DEFAULT_BOTTOM_BADGE_MIN_SPACING_PX = 52;
const DEFAULT_BOTTOM_BADGE_ROW_HEIGHT = 24;
const DEFAULT_BOTTOM_BADGE_MAX_NUDGE_PX = 18;

/** Rotated label horizontal footprint at the anchor (fontSize ≈ label height when vertical). */
export function estimateRotatedLabelWidthPx(labelFontSize: number): number {
  return labelFontSize + 4;
}

/**
 * Split top reference-line labels when lines sit too close on the canvas.
 * Applies pairwise dx offsets (left −offset, right +offset) when gap < minLineGapPx.
 */
export function resolveLineLabelLayouts(
  anchors: LineLabelAnchor[],
  options?: {
    minLineGapPx?: number;
    splitOffsetPx?: number;
    labelFontSize?: number;
    rotate?: number;
  },
): LineLabelLayout[] {
  const minGap = options?.minLineGapPx ?? DEFAULT_LINE_LABEL_GAP_PX;
  const split = options?.splitOffsetPx ?? DEFAULT_LINE_LABEL_SPLIT_PX;
  const rotate = options?.rotate ?? -90;
  const labelWidth = estimateRotatedLabelWidthPx(options?.labelFontSize ?? 20);

  const dxByKey = new Map<string, number>();
  for (const anchor of anchors) dxByKey.set(anchor.key, 0);

  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    const gap = right.x - left.x;
    const leftDx = dxByKey.get(left.key) ?? 0;
    const rightDx = dxByKey.get(right.key) ?? 0;
    const effectiveGap = gap + rightDx - leftDx;

    if (gap < minGap || effectiveGap < labelWidth) {
      dxByKey.set(left.key, leftDx - split);
      dxByKey.set(right.key, rightDx + split);
    }
  }

  return anchors.map((anchor) => ({
    key: anchor.key,
    x: anchor.x,
    dx: dxByKey.get(anchor.key) ?? 0,
    rotate,
  }));
}

function estimateBottomBadgeWidth(text: string, pill?: boolean): number {
  if (pill) return 68;
  return Math.max(36, text.length * 9 + 8);
}

/** Symmetric horizontal split when badge anchors sit too close together. */
function resolveBottomBadgeAnchorOffsets(
  labels: BottomBadgeInput[],
  minSpacingPx: number,
): Map<string, number> {
  const dxByKey = new Map<string, number>();
  for (const label of labels) dxByKey.set(label.key, 0);

  const sorted = [...labels].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    const leftWidth = estimateBottomBadgeWidth(left.text, left.pill);
    const rightWidth = estimateBottomBadgeWidth(right.text, right.pill);
    const minCenterGap = Math.max(minSpacingPx, (leftWidth + rightWidth) / 2 + 4);
    const leftDx = dxByKey.get(left.key) ?? 0;
    const rightDx = dxByKey.get(right.key) ?? 0;
    const gap = right.x - left.x + rightDx - leftDx;

    if (gap < minCenterGap) {
      const deficit = minCenterGap - gap;
      const half = Math.ceil(deficit / 2);
      dxByKey.set(left.key, leftDx - half);
      dxByKey.set(right.key, rightDx + half);
    }
  }

  return dxByKey;
}

/**
 * De-conflict bottom strike badges: merge identical values, nudge horizontally,
 * then stagger vertically when labels still overlap.
 */
export function resolveBottomBadgeLayout(
  labels: BottomBadgeInput[],
  baseY: number,
  options?: {
    minSpacingPx?: number;
    rowHeight?: number;
    maxHorizontalNudgePx?: number;
    combineWithinPx?: number;
  },
): ResolvedBottomBadge[] {
  const minSpacing = options?.minSpacingPx ?? DEFAULT_BOTTOM_BADGE_MIN_SPACING_PX;
  const rowHeight = options?.rowHeight ?? DEFAULT_BOTTOM_BADGE_ROW_HEIGHT;
  const maxNudge = options?.maxHorizontalNudgePx ?? DEFAULT_BOTTOM_BADGE_MAX_NUDGE_PX;

  const merged = new Map<string, BottomBadgeInput>();
  for (const label of labels) {
    const duplicateText = [...merged.values()].find((candidate) => candidate.text === label.text);
    if (duplicateText) continue;
    merged.set(label.key, label);
  }

  const anchorOffsets = resolveBottomBadgeAnchorOffsets([...merged.values()], minSpacing);

  const unique = [...merged.values()]
    .map((label) => ({
      ...label,
      x: label.x + (anchorOffsets.get(label.key) ?? 0),
    }))
    .sort((a, b) => a.x - b.x);
  const placed: { centerX: number; row: number; width: number }[] = [];
  const resolved: ResolvedBottomBadge[] = [];

  for (const label of unique) {
    const width = estimateBottomBadgeWidth(label.text, label.pill);
    let row = 0;
    let dx = 0;
    let placedOk = false;

    while (!placedOk && row < 4) {
      for (let nudge = 0; nudge <= maxNudge; nudge += 6) {
        for (const sign of nudge === 0 ? [0] : [-1, 1]) {
          const candidateDx = sign * nudge;
          const centerX = label.x + candidateDx;
          const overlaps = placed.some(
            (p) =>
              p.row === row &&
              Math.abs(p.centerX - centerX) < (p.width + width) / 2 + 4,
          );
          if (!overlaps) {
            dx = candidateDx;
            placed.push({ centerX, row, width });
            resolved.push({
              ...label,
              x: centerX,
              y: baseY - row * rowHeight,
              dx: (anchorOffsets.get(label.key) ?? 0) + candidateDx,
            });
            placedOk = true;
            break;
          }
        }
        if (placedOk) break;
      }
      if (!placedOk) row += 1;
    }

    if (!placedOk) {
      placed.push({ centerX: label.x, row, width });
      resolved.push({
        ...label,
        x: label.x,
        y: baseY - row * rowHeight,
        dx: anchorOffsets.get(label.key) ?? 0,
      });
    }
  }

  const order = new Map(labels.map((label, index) => [label.key, index]));
  return resolved.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}
