import type { GexStrikePoint } from "@/lib/unusualwhales/types";

export interface StrikeViewport {
  min: number;
  max: number;
}

const MIN_SPAN_RATIO = 0.08;
const MAX_ZOOM_STEPS = 12;

export function strikeBounds(points: GexStrikePoint[]): StrikeViewport {
  if (!points.length) return { min: 0, max: 1 };
  return { min: points[0].strike, max: points[points.length - 1].strike };
}

export function initialStrikeViewport(
  points: GexStrikePoint[],
  stockPrice: number | null,
  paddingPct = 0.35,
): StrikeViewport {
  const bounds = strikeBounds(points);
  if (!points.length) return bounds;
  if (stockPrice == null || stockPrice <= 0) return bounds;

  let min = stockPrice * (1 - paddingPct);
  let max = stockPrice * (1 + paddingPct);
  const filtered = points.filter((p) => p.strike >= min && p.strike <= max);
  if (filtered.length >= 8) {
    return clampStrikeViewport({ min, max }, bounds);
  }

  const centerIdx = points.reduce(
    (best, p, i) =>
      Math.abs(p.strike - stockPrice) < Math.abs(points[best].strike - stockPrice) ? i : best,
    0,
  );
  const half = 20;
  const start = Math.max(0, centerIdx - half);
  const end = Math.min(points.length, centerIdx + half + 1);
  return { min: points[start].strike, max: points[end - 1].strike };
}

export function clampStrikeViewport(vp: StrikeViewport, bounds: StrikeViewport): StrikeViewport {
  const fullSpan = bounds.max - bounds.min || 1;
  const minSpan = fullSpan * MIN_SPAN_RATIO;
  let span = Math.max(minSpan, Math.min(fullSpan, vp.max - vp.min));
  let min = vp.min;
  let max = min + span;

  if (min < bounds.min) {
    min = bounds.min;
    max = min + span;
  }
  if (max > bounds.max) {
    max = bounds.max;
    min = max - span;
  }

  return { min, max };
}

export function zoomStrikeViewport(
  vp: StrikeViewport,
  scale: number,
  focalStrike: number,
  bounds: StrikeViewport,
): StrikeViewport {
  const span = vp.max - vp.min || 1;
  const fullSpan = bounds.max - bounds.min || 1;
  const minSpan = fullSpan * MIN_SPAN_RATIO;
  const newSpan = Math.max(minSpan, Math.min(fullSpan, span / scale));
  const ratio = (focalStrike - vp.min) / span;
  let min = focalStrike - ratio * newSpan;
  let max = min + newSpan;
  return clampStrikeViewport({ min, max }, bounds);
}

export function panStrikeViewport(
  vp: StrikeViewport,
  deltaStrike: number,
  bounds: StrikeViewport,
): StrikeViewport {
  const span = vp.max - vp.min;
  let min = vp.min + deltaStrike;
  let max = vp.max + deltaStrike;
  if (min < bounds.min) {
    min = bounds.min;
    max = min + span;
  }
  if (max > bounds.max) {
    max = bounds.max;
    min = max - span;
  }
  return { min, max };
}

export function strikesInViewport(points: GexStrikePoint[], vp: StrikeViewport): GexStrikePoint[] {
  return points.filter((p) => p.strike >= vp.min && p.strike <= vp.max);
}

export function clientXToStrike(
  clientX: number,
  rect: Pick<DOMRect, "left" | "width">,
  vp: StrikeViewport,
): number {
  const rel = (clientX - rect.left) / rect.width;
  return vp.min + rel * (vp.max - vp.min);
}

export function nearestStrike(
  points: GexStrikePoint[],
  strike: number,
): GexStrikePoint | null {
  if (!points.length) return null;
  let best = points[0];
  let bestDist = Math.abs(points[0].strike - strike);
  for (const point of points) {
    const dist = Math.abs(point.strike - strike);
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

export function isViewportZoomed(vp: StrikeViewport, bounds: StrikeViewport): boolean {
  const fullSpan = bounds.max - bounds.min || 1;
  const span = vp.max - vp.min;
  return span < fullSpan * 0.98;
}

export function maxZoomScale(bounds: StrikeViewport): number {
  const fullSpan = bounds.max - bounds.min || 1;
  const minSpan = fullSpan * MIN_SPAN_RATIO;
  return Math.max(1, fullSpan / minSpan);
}

export const DEFAULT_Y_SCALE = 1;
export const MIN_Y_SCALE = 0.25;
export const MAX_Y_SCALE = 4;

export function clampYScale(scale: number): number {
  return Math.max(MIN_Y_SCALE, Math.min(MAX_Y_SCALE, scale));
}

export function zoomYScale(current: number, scale: number): number {
  return clampYScale(current * scale);
}

export function isYScaleZoomed(scale: number): boolean {
  return Math.abs(scale - DEFAULT_Y_SCALE) > 0.05;
}

export { MAX_ZOOM_STEPS };
