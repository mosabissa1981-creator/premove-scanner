"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GexStrikePoint } from "@/lib/unusualwhales/types";
import {
  clientXToStrike,
  initialStrikeViewport,
  isViewportZoomed,
  nearestStrike,
  panStrikeViewport,
  strikeBounds,
  strikesInViewport,
  zoomStrikeViewport,
  type StrikeViewport,
} from "@/lib/gex-study/gex-chart-viewport";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 300;
const PAD = { top: 28, right: 48, bottom: 36, left: 48 };
const TAP_THRESHOLD_PX = 10;

function formatAxisMoney(value: number, signed = false): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatStrike(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

interface LevelLine {
  value: number;
  label: string;
  color: string;
}

interface TooltipState {
  point: GexStrikePoint;
  x: number;
  y: number;
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
  const bounds = useMemo(() => strikeBounds(strikes), [strikes]);
  const [viewport, setViewport] = useState<StrikeViewport>(() =>
    initialStrikeViewport(strikes, stockPrice),
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const viewportRef = useRef(viewport);
  const gestureRef = useRef<{
    mode: "none" | "pan" | "pinch" | "tap";
    startViewport: StrikeViewport;
    startDist: number;
    startClientX: number;
    startClientY: number;
    lastClientX: number;
    moved: boolean;
  }>({
    mode: "none",
    startViewport: { min: 0, max: 1 },
    startDist: 0,
    startClientX: 0,
    startClientY: 0,
    lastClientX: 0,
    moved: false,
  });

  const updateViewport = useCallback((next: StrikeViewport | ((prev: StrikeViewport) => StrikeViewport)) => {
    setViewport((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      viewportRef.current = resolved;
      return resolved;
    });
  }, []);

  const resetView = useCallback(() => {
    const next = initialStrikeViewport(strikes, stockPrice);
    viewportRef.current = next;
    setViewport(next);
    setTooltip(null);
  }, [stockPrice, strikes]);

  useEffect(() => {
    resetView();
  }, [strikes, stockPrice, putWall, gammaFlip, callWall, resetView]);

  const showTooltipAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el || !strikes.length) return;
      const rect = el.getBoundingClientRect();
      const strike = clientXToStrike(clientX, rect, viewportRef.current);
      const visible = strikesInViewport(strikes, viewportRef.current);
      const point = nearestStrike(visible, strike);
      if (!point) return;
      setTooltip({
        point,
        x: clientX - rect.left,
        y: clientY - rect.top,
      });
    },
    [strikes],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const g = gestureRef.current;
      const vp = viewportRef.current;

      if (e.touches.length === 2) {
        g.mode = "pinch";
        g.startDist = touchDistance(e.touches);
        g.startViewport = vp;
        g.moved = false;
        setTooltip(null);
        return;
      }

      if (e.touches.length === 1) {
        g.mode = "tap";
        g.startViewport = vp;
        g.startClientX = e.touches[0].clientX;
        g.startClientY = e.touches[0].clientY;
        g.lastClientX = e.touches[0].clientX;
        g.moved = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const g = gestureRef.current;

      if (g.mode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        if (g.startDist <= 0) return;
        const scale = touchDistance(e.touches) / g.startDist;
        const center = touchCenter(e.touches);
        const focal = clientXToStrike(center.x, rect, g.startViewport);
        updateViewport(zoomStrikeViewport(g.startViewport, scale, focal, bounds));
        return;
      }

      if (g.mode === "tap" && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - g.startClientX;
        const dy = touch.clientY - g.startClientY;
        if (Math.hypot(dx, dy) > TAP_THRESHOLD_PX) {
          g.mode = "pan";
          g.moved = true;
          g.lastClientX = touch.clientX;
          setTooltip(null);
        }
      }

      if (g.mode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - g.lastClientX;
        g.lastClientX = touch.clientX;
        const span = g.startViewport.max - g.startViewport.min;
        const deltaStrike = (-dx / rect.width) * span;
        updateViewport(panStrikeViewport(viewportRef.current, deltaStrike, bounds));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (g.mode === "tap" && !g.moved && e.changedTouches[0]) {
        showTooltipAt(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
      g.mode = "none";
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      gestureRef.current.mode = "pan";
      gestureRef.current.startViewport = viewportRef.current;
      gestureRef.current.lastClientX = e.clientX;
      gestureRef.current.moved = false;
      setTooltip(null);
    };

    const onMouseMove = (e: MouseEvent) => {
      const g = gestureRef.current;
      if (g.mode !== "pan" || e.buttons !== 1) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - g.lastClientX;
      g.lastClientX = e.clientX;
      g.moved = true;
      const span = viewportRef.current.max - viewportRef.current.min;
      const deltaStrike = (-dx / rect.width) * span;
      updateViewport(panStrikeViewport(viewportRef.current, deltaStrike, bounds));
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
  }, [bounds, showTooltipAt, updateViewport]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const focal = clientXToStrike(e.clientX, rect, viewportRef.current);
      const scale = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      updateViewport(zoomStrikeViewport(viewportRef.current, scale, focal, bounds));
    },
    [bounds, updateViewport],
  );

  const onBarClick = useCallback(
    (point: GexStrikePoint, e: React.MouseEvent<SVGGElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setTooltip({
        point,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  if (!strikes.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800 text-sm text-zinc-500">
        No strike data for this expiry.
      </div>
    );
  }

  const visible = strikesInViewport(strikes, viewport);
  const strikeMin = viewport.min;
  const strikeMax = viewport.max;
  const strikeSpan = strikeMax - strikeMin || 1;

  const plotW = CHART_WIDTH - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const barMax = Math.max(...visible.map((p) => Math.abs(p.netGex)), 1);
  const profileValues = visible.map((p) => p.profile);
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

  const barWidth = Math.max(3, Math.min(14, (plotW / Math.max(visible.length, 1)) * 0.72));
  const zeroY = PAD.top + plotH / 2;

  const profileLine = visible.map((p) => `${xForStrike(p.strike)},${yForProfile(p.profile)}`).join(" ");
  const profileArea = visible.length
    ? `${profileLine} ${xForStrike(visible[visible.length - 1].strike)},${zeroY} ${xForStrike(visible[0].strike)},${zeroY}`
    : "";

  const levels: LevelLine[] = [];
  if (putWall != null && putWall >= strikeMin && putWall <= strikeMax) {
    levels.push({ value: putWall, label: "Put Wall", color: "#f87171" });
  }
  if (gammaFlip != null && gammaFlip >= strikeMin && gammaFlip <= strikeMax) {
    levels.push({ value: gammaFlip, label: "Gamma Flip", color: "#d4a853" });
  }
  if (callWall != null && callWall >= strikeMin && callWall <= strikeMax) {
    levels.push({ value: callWall, label: "Call Wall", color: "#34d399" });
  }

  const yTicks = [-barMax, -barMax / 2, 0, barMax / 2, barMax];
  const profileTicks = [profileMin, profileMax];
  const zoomed = isViewportZoomed(viewport, bounds);

  const xTickStep = strikeSpan > 30 ? 10 : strikeSpan > 15 ? 5 : 2;
  const xTicks: number[] = [];
  const firstTick = Math.ceil(strikeMin / xTickStep) * xTickStep;
  for (let t = firstTick; t <= strikeMax; t += xTickStep) {
    xTicks.push(t);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
        <span>Pinch to zoom · Drag to pan · Tap a bar for details</span>
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
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-full w-full"
          role="img"
          aria-label="Gamma exposure by strike"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="transparent" />

          <line
            x1={PAD.left}
            y1={zeroY}
            x2={PAD.left + plotW}
            y2={zeroY}
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
              x={CHART_WIDTH - PAD.right + 6}
              y={yForProfile(tick) + 4}
              textAnchor="start"
              fill="#d4a853"
              fontSize="10"
            >
              {formatAxisMoney(tick)}
            </text>
          ))}

          {profileArea && (
            <polygon points={profileArea} fill="#d4a853" opacity={0.12} stroke="none" />
          )}

          {visible.map((point) => {
            const x = xForStrike(point.strike) - barWidth / 2;
            const y1 = yForBar(point.netGex);
            const positive = point.netGex >= 0;
            const selected = tooltip?.point.strike === point.strike;
            return (
              <g
                key={point.strike}
                onClick={(e) => onBarClick(point, e)}
                onMouseEnter={(e) => {
                  const el = containerRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  setTooltip({
                    point,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
              >
                <rect
                  x={x - 2}
                  y={PAD.top}
                  width={barWidth + 4}
                  height={plotH}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={Math.min(zeroY, y1)}
                  width={barWidth}
                  height={Math.max(1, Math.abs(y1 - zeroY))}
                  fill={positive ? "#34d399" : "#f87171"}
                  opacity={selected ? 1 : 0.85}
                  stroke={selected ? "#f4f4f5" : "none"}
                  strokeWidth={selected ? 1.5 : 0}
                />
              </g>
            );
          })}

          <polyline
            points={profileLine}
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
                <text x={x} y={PAD.top - 8} textAnchor="middle" fill={level.color} fontSize="10">
                  {level.label}
                </text>
                <text x={x} y={CHART_HEIGHT - 8} textAnchor="middle" fill={level.color} fontSize="10">
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

          {xTicks.map((tick) => (
            <text
              key={`xs-${tick}`}
              x={xForStrike(tick)}
              y={CHART_HEIGHT - 22}
              textAnchor="middle"
              fill="#71717a"
              fontSize="10"
            >
              {formatStrike(tick)}
            </text>
          ))}
        </svg>

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 min-w-[148px] rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl"
            style={{
              left: Math.min(Math.max(tooltip.x + 12, 8), (containerRef.current?.clientWidth ?? 300) - 160),
              top: Math.max(tooltip.y - 72, 8),
            }}
          >
            <div className="font-semibold text-zinc-100">Strike: {formatStrike(tooltip.point.strike)}</div>
            <div className={tooltip.point.netGex >= 0 ? "text-emerald-400" : "text-red-400"}>
              Net GEX: {formatAxisMoney(tooltip.point.netGex, true)}
            </div>
            <div className="text-amber-300">
              Gamma Profile: {formatAxisMoney(tooltip.point.profile, true)}
            </div>
          </div>
        )}
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
        <span className="text-zinc-500">
          {visible.length} strikes · {formatStrike(strikeMin)}–{formatStrike(strikeMax)}
        </span>
      </div>
    </div>
  );
}
