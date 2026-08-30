"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GexStrikePoint } from "@/lib/unusualwhales/types";
import {
  CHART_VIEW_HEIGHT,
  CHART_VIEW_WIDTH,
  DEFAULT_CHART_VIEW,
  clientToChartSvg,
  isChartZoomed,
  panChartViewBox,
  zoomChartAtPoint,
  type ViewBox,
} from "@/lib/gex-study/gex-chart-view";

const PAD = { top: 16, right: 48, bottom: 36, left: 48 };

function formatAxisMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatStrike(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

interface LevelLine {
  value: number;
  label: string;
  color: string;
}

interface GexStrikeChartProps {
  strikes: GexStrikePoint[];
  stockPrice: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  callWall: number | null;
}

function touchDistance(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function touchCenter(touches: TouchList): { x: number; y: number } {
  if (touches.length < 2) {
    return { x: touches[0].clientX, y: touches[0].clientY };
  }
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

export function GexStrikeChart({
  strikes,
  stockPrice,
  putWall,
  gammaFlip,
  callWall,
}: GexStrikeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewBoxRef = useRef<ViewBox>(DEFAULT_CHART_VIEW);
  const [viewBox, setViewBox] = useState<ViewBox>(DEFAULT_CHART_VIEW);
  const gestureRef = useRef<{
    mode: "none" | "pan" | "pinch";
    startVb: ViewBox;
    startDist: number;
    lastPan: { x: number; y: number };
  }>({
    mode: "none",
    startVb: DEFAULT_CHART_VIEW,
    startDist: 0,
    lastPan: { x: 0, y: 0 },
  });

  const updateViewBox = useCallback((next: ViewBox | ((prev: ViewBox) => ViewBox)) => {
    setViewBox((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      viewBoxRef.current = resolved;
      return resolved;
    });
  }, []);

  const resetView = useCallback(() => {
    viewBoxRef.current = DEFAULT_CHART_VIEW;
    setViewBox(DEFAULT_CHART_VIEW);
  }, []);

  useEffect(() => {
    resetView();
  }, [strikes, stockPrice, putWall, gammaFlip, callWall, resetView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const g = gestureRef.current;
      const vb = viewBoxRef.current;

      if (e.touches.length === 2) {
        g.mode = "pinch";
        g.startDist = touchDistance(e.touches);
        g.startVb = vb;
        const center = touchCenter(e.touches);
        g.lastPan = center;
        void rect;
      } else if (e.touches.length === 1) {
        g.mode = "pan";
        g.lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        g.startVb = vb;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const g = gestureRef.current;

      if (g.mode === "none") return;
      e.preventDefault();

      if (g.mode === "pinch" && e.touches.length >= 2) {
        const dist = touchDistance(e.touches);
        if (g.startDist <= 0) return;
        const scale = dist / g.startDist;
        const center = touchCenter(e.touches);
        const svgPoint = clientToChartSvg(center.x, center.y, rect, g.startVb);
        updateViewBox(zoomChartAtPoint(g.startVb, scale, svgPoint.x, svgPoint.y));
        return;
      }

      if (g.mode === "pan" && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - g.lastPan.x;
        const dy = touch.clientY - g.lastPan.y;
        g.lastPan = { x: touch.clientX, y: touch.clientY };
        updateViewBox((vb) => panChartViewBox(vb, dx, dy, rect.width, rect.height));
      }
    };

    const onTouchEnd = () => {
      gestureRef.current.mode = "none";
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      gestureRef.current.mode = "pan";
      gestureRef.current.lastPan = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const g = gestureRef.current;
      if (g.mode !== "pan" || e.buttons !== 1) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - g.lastPan.x;
      const dy = e.clientY - g.lastPan.y;
      g.lastPan = { x: e.clientX, y: e.clientY };
      updateViewBox((vb) => panChartViewBox(vb, dx, dy, rect.width, rect.height));
    };

    const onMouseUp = () => {
      gestureRef.current.mode = "none";
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [updateViewBox]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const vb = viewBoxRef.current;
      const svgPoint = clientToChartSvg(e.clientX, e.clientY, rect, vb);
      const scale = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      updateViewBox(zoomChartAtPoint(vb, scale, svgPoint.x, svgPoint.y));
    },
    [updateViewBox],
  );

  if (!strikes.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800 text-sm text-zinc-500">
        No strike data for this expiry.
      </div>
    );
  }

  const plotW = CHART_VIEW_WIDTH - PAD.left - PAD.right;
  const plotH = CHART_VIEW_HEIGHT - PAD.top - PAD.bottom;
  const strikeMin = strikes[0].strike;
  const strikeMax = strikes[strikes.length - 1].strike;
  const strikeSpan = strikeMax - strikeMin || 1;

  const barMax = Math.max(...strikes.map((p) => Math.abs(p.netGex)), 1);
  const profileValues = strikes.map((p) => p.profile);
  const profileMin = Math.min(...profileValues, 0);
  const profileMax = Math.max(...profileValues, 0);
  const profileSpan = profileMax - profileMin || 1;

  const xForStrike = (strike: number) =>
    PAD.left + ((strike - strikeMin) / strikeSpan) * plotW;
  const yForBar = (netGex: number) => {
    const zeroY = PAD.top + plotH / 2;
    const half = plotH * 0.42;
    return zeroY - (netGex / barMax) * half;
  };
  const yForProfile = (profile: number) =>
    PAD.top + plotH - ((profile - profileMin) / profileSpan) * plotH;

  const barWidth = Math.max(2, Math.min(12, plotW / strikes.length - 1));
  const profilePoints = strikes
    .map((p) => `${xForStrike(p.strike)},${yForProfile(p.profile)}`)
    .join(" ");

  const levels: LevelLine[] = [];
  if (putWall != null && putWall >= strikeMin && putWall <= strikeMax) {
    levels.push({ value: putWall, label: "Put Wall", color: "#f87171" });
  }
  if (gammaFlip != null && gammaFlip >= strikeMin && gammaFlip <= strikeMax) {
    levels.push({ value: gammaFlip, label: "Gamma Flip", color: "#f4f4f5" });
  }
  if (callWall != null && callWall >= strikeMin && callWall <= strikeMax) {
    levels.push({ value: callWall, label: "Call Wall", color: "#34d399" });
  }

  const yTicks = [-barMax, -barMax / 2, 0, barMax / 2, barMax];
  const profileTicks = [profileMin, profileMax];
  const zoomed = isChartZoomed(viewBox);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
        <span>Pinch to zoom · Drag to pan</span>
        {zoomed && (
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Reset zoom
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative h-[300px] w-full cursor-grab select-none active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onWheel={onWheel}
        onDoubleClick={resetView}
      >
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="h-full w-full"
          role="img"
          aria-label="Gamma exposure by strike"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x={0} y={0} width={CHART_VIEW_WIDTH} height={CHART_VIEW_HEIGHT} fill="transparent" />

          <line
            x1={PAD.left}
            y1={PAD.top + plotH / 2}
            x2={PAD.left + plotW}
            y2={PAD.top + plotH / 2}
            stroke="#3f3f46"
            strokeDasharray="4 4"
          />

          {yTicks.map((tick) => {
            const y = yForBar(tick);
            return (
              <g key={`yt-${tick}`}>
                <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#27272a" />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill="#71717a" fontSize="10">
                  {formatAxisMoney(tick)}
                </text>
              </g>
            );
          })}

          {profileTicks.map((tick, i) => (
            <text
              key={`pr-${i}`}
              x={CHART_VIEW_WIDTH - PAD.right + 6}
              y={yForProfile(tick) + 4}
              textAnchor="start"
              fill="#d4a853"
              fontSize="10"
            >
              {formatAxisMoney(tick)}
            </text>
          ))}

          {strikes.map((point) => {
            const x = xForStrike(point.strike) - barWidth / 2;
            const y0 = PAD.top + plotH / 2;
            const y1 = yForBar(point.netGex);
            const positive = point.netGex >= 0;
            return (
              <rect
                key={point.strike}
                x={x}
                y={Math.min(y0, y1)}
                width={barWidth}
                height={Math.max(1, Math.abs(y1 - y0))}
                fill={positive ? "#34d399" : "#f87171"}
                opacity={0.85}
              />
            );
          })}

          <polyline
            points={profilePoints}
            fill="none"
            stroke="#d4a853"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {levels.map((level) => {
            const x = xForStrike(level.value);
            return (
              <g key={level.label}>
                <line
                  x1={x}
                  y1={PAD.top}
                  x2={x}
                  y2={PAD.top + plotH}
                  stroke={level.color}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
                <text x={x} y={PAD.top - 4} textAnchor="middle" fill={level.color} fontSize="10">
                  {level.label}
                </text>
                <text
                  x={x}
                  y={CHART_VIEW_HEIGHT - 8}
                  textAnchor="middle"
                  fill={level.color}
                  fontSize="10"
                >
                  {formatStrike(level.value)}
                </text>
              </g>
            );
          })}

          {stockPrice != null && stockPrice >= strikeMin && stockPrice <= strikeMax && (
            <g>
              <line
                x1={xForStrike(stockPrice)}
                y1={PAD.top}
                x2={xForStrike(stockPrice)}
                y2={PAD.top + plotH}
                stroke="#3b82f6"
                strokeWidth={1}
                opacity={0.5}
              />
              <rect
                x={xForStrike(stockPrice) - 24}
                y={PAD.top + plotH + 6}
                width={48}
                height={18}
                rx={9}
                fill="#1d4ed8"
              />
              <text
                x={xForStrike(stockPrice)}
                y={PAD.top + plotH + 19}
                textAnchor="middle"
                fill="#eff6ff"
                fontSize="10"
                fontWeight="600"
              >
                {formatStrike(stockPrice)}
              </text>
            </g>
          )}

          {strikes
            .filter((_, i) => i % Math.ceil(strikes.length / 8) === 0 || i === strikes.length - 1)
            .map((point) => (
              <text
                key={`xs-${point.strike}`}
                x={xForStrike(point.strike)}
                y={CHART_VIEW_HEIGHT - 22}
                textAnchor="middle"
                fill="#71717a"
                fontSize="10"
              >
                {formatStrike(point.strike)}
              </text>
            ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-400" />
          Net GEX (+)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-400" />
          Net GEX (−)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-amber-400" />
          Gamma profile
        </span>
      </div>
    </div>
  );
}
