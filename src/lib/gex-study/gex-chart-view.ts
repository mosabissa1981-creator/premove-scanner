export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CHART_VIEW_WIDTH = 720;
export const CHART_VIEW_HEIGHT = 300;
export const MIN_CHART_ZOOM = 1;
export const MAX_CHART_ZOOM = 8;

export const DEFAULT_CHART_VIEW: ViewBox = {
  x: 0,
  y: 0,
  w: CHART_VIEW_WIDTH,
  h: CHART_VIEW_HEIGHT,
};

export function clampViewBox(vb: ViewBox): ViewBox {
  const zoom = CHART_VIEW_WIDTH / vb.w;
  const clampedZoom = Math.min(MAX_CHART_ZOOM, Math.max(MIN_CHART_ZOOM, zoom));
  const w = CHART_VIEW_WIDTH / clampedZoom;
  const h = CHART_VIEW_HEIGHT / clampedZoom;
  const x = Math.max(0, Math.min(CHART_VIEW_WIDTH - w, vb.x));
  const y = Math.max(0, Math.min(CHART_VIEW_HEIGHT - h, vb.y));
  return { x, y, w, h };
}

export function zoomChartAtPoint(vb: ViewBox, scale: number, px: number, py: number): ViewBox {
  const nextW = vb.w / scale;
  const nextH = vb.h / scale;
  const nextX = px - (px - vb.x) / scale;
  const nextY = py - (py - vb.y) / scale;
  return clampViewBox({ x: nextX, y: nextY, w: nextW, h: nextH });
}

export function panChartViewBox(
  vb: ViewBox,
  dx: number,
  dy: number,
  containerW: number,
  containerH: number,
): ViewBox {
  const scaleX = vb.w / containerW;
  const scaleY = vb.h / containerH;
  return clampViewBox({
    x: vb.x - dx * scaleX,
    y: vb.y - dy * scaleY,
    w: vb.w,
    h: vb.h,
  });
}

export function clientToChartSvg(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  vb: ViewBox,
): { x: number; y: number } {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  return { x: vb.x + relX * vb.w, y: vb.y + relY * vb.h };
}

export function isChartZoomed(vb: ViewBox): boolean {
  return vb.w < CHART_VIEW_WIDTH - 1;
}
