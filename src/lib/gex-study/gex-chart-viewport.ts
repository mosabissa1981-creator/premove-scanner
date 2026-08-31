import type { GexStrikePoint } from "@/lib/unusualwhales/types";

export interface StrikeViewport {
  min: number;
  max: number;
}

const MIN_SPAN_RATIO = 0.08;
const MAX_ZOOM_STEPS = 12;

/** Always sort by numeric strike so viewport bounds stay ascending. */
export function sortStrikesByPrice(points: GexStrikePoint[]): GexStrikePoint[] {
  return [...points].sort((a, b) => Number(a.strike) - Number(b.strike));
}

export function strikeBounds(points: GexStrikePoint[]): StrikeViewport {
  if (!points.length) return { min: 0, max: 1 };
  const sorted = sortStrikesByPrice(points);
  return { min: sorted[0].strike, max: sorted[sorted.length - 1].strike };
}

export function initialStrikeViewport(
  points: GexStrikePoint[],
  stockPrice: number | null,
  paddingPct = 0.35,
): StrikeViewport {
  const sorted = sortStrikesByPrice(points);
  const bounds = strikeBounds(sorted);
  if (!sorted.length) return bounds;
  if (stockPrice == null || stockPrice <= 0) return bounds;

  let min = stockPrice * (1 - paddingPct);
  let max = stockPrice * (1 + paddingPct);
  const filtered = sorted.filter((p) => p.strike >= min && p.strike <= max);
  if (filtered.length >= 8) {
    return clampStrikeViewport({ min, max }, bounds);
  }

  const centerIdx = sorted.reduce(
    (best, p, i) =>
      Math.abs(p.strike - stockPrice) < Math.abs(sorted[best].strike - stockPrice) ? i : best,
    0,
  );
  const half = 20;
  const start = Math.max(0, centerIdx - half);
  const end = Math.min(sorted.length, centerIdx + half + 1);
  return { min: sorted[start].strike, max: sorted[end - 1].strike };
}

export function clampStrikeViewport(vp: StrikeViewport, bounds: StrikeViewport): StrikeViewport {
  const domainMin = Math.min(bounds.min, bounds.max);
  const domainMax = Math.max(bounds.min, bounds.max);
  const fullSpan = domainMax - domainMin || 1;
  const minSpan = fullSpan * MIN_SPAN_RATIO;
  let span = Math.max(minSpan, Math.min(fullSpan, vp.max - vp.min));
  let min = Math.min(vp.min, vp.max);
  let max = min + span;

  if (min < domainMin) {
    min = domainMin;
    max = min + span;
  }
  if (max > domainMax) {
    max = domainMax;
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
  const domainMin = Math.min(bounds.min, bounds.max);
  const domainMax = Math.max(bounds.min, bounds.max);
  const fullSpan = domainMax - domainMin || 1;
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
  const domainMin = Math.min(bounds.min, bounds.max);
  const domainMax = Math.max(bounds.min, bounds.max);
  if (min < domainMin) {
    min = domainMin;
    max = min + span;
  }
  if (max > domainMax) {
    max = domainMax;
    min = max - span;
  }
  return { min, max };
}

export function strikesInViewport(points: GexStrikePoint[], vp: StrikeViewport): GexStrikePoint[] {
  const min = Math.min(vp.min, vp.max);
  const max = Math.max(vp.min, vp.max);
  return sortStrikesByPrice(points).filter((p) => p.strike >= min && p.strike <= max);
}

export function clientXToStrike(
  clientX: number,
  rect: Pick<DOMRect, "left" | "width">,
  vp: StrikeViewport,
): number {
  const rel = (clientX - rect.left) / rect.width;
  const min = Math.min(vp.min, vp.max);
  const max = Math.max(vp.min, vp.max);
  return min + rel * (max - min);
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
  const domainMin = Math.min(bounds.min, bounds.max);
  const domainMax = Math.max(bounds.min, bounds.max);
  const fullSpan = domainMax - domainMin || 1;
  const span = Math.abs(vp.max - vp.min);
  return span < fullSpan * 0.98;
}

export function maxZoomScale(bounds: StrikeViewport): number {
  const domainMin = Math.min(bounds.min, bounds.max);
  const domainMax = Math.max(bounds.min, bounds.max);
  const fullSpan = domainMax - domainMin || 1;
  const minSpan = fullSpan * MIN_SPAN_RATIO;
  return Math.max(1, fullSpan / minSpan);
}

export { MAX_ZOOM_STEPS };
