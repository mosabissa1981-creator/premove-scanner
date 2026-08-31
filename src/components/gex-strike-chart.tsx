"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GexStrikePoint } from "@/lib/unusualwhales/types";
import {
  clientXToStrike,
  initialStrikeViewport,
  isViewportZoomed,
  nearestStrike,
  panStrikeViewport,
  sortStrikesByPrice,
  strikeBounds,
  strikesInViewport,
  zoomStrikeViewport,
  type StrikeViewport,
} from "@/lib/gex-study/gex-chart-viewport";
import {
  barSeriesFromUnified,
  buildUnifiedChartData,
  createBarYScale,
  createProfileYScale,
  createStrikeXScale,
  profileSeriesFromUnified,
  splitStrikeSeriesForChart,
  unifiedChartToGexPoint,
} from "@/utils/chart-domain";
import {
  buildProfileFillPolygons,
  computeBackgroundStrikeTicks,
  formatChartMoney,
  GEX_CHART_AXIS,
  GEX_CHART_LAYOUT,
  GEX_CHART_THEME,
  resolveBottomBadgeLayout,
  resolveLineLabelLayouts,
} from "@/lib/gex-study/gex-chart-ui";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 380;
const PAD = { top: 44, right: 82, bottom: 54, left: 82 };
const AXIS_FONT = 22;
const LABEL_FONT = 20;
const VALUE_FONT = 22;
const TAP_THRESHOLD_PX = 10;

function coerceStrike(value: number | null | undefined): number | null {
  if (value == null) return null;
  const strike = Number(value);
  return Number.isFinite(strike) ? strike : null;
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
  const sortedStrikes = useMemo(() => sortStrikesByPrice(strikes), [strikes]);
  const unifiedChartData = useMemo(() => {
    const { profileCurve, barStrikes } = splitStrikeSeriesForChart(sortedStrikes);
    return buildUnifiedChartData(profileCurve, barStrikes);
  }, [sortedStrikes]);
  const chartStrikes = useMemo(
    () => unifiedChartData.map(unifiedChartToGexPoint),
    [unifiedChartData],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const bounds = useMemo(() => strikeBounds(chartStrikes), [chartStrikes]);
  const [viewport, setViewport] = useState<StrikeViewport>(() =>
    initialStrikeViewport(chartStrikes, stockPrice),
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
    const next = initialStrikeViewport(chartStrikes, stockPrice);
    viewportRef.current = next;
    setViewport(next);
    setTooltip(null);
  }, [stockPrice, chartStrikes]);

  const chartDataKey = useMemo(() => {
    if (!unifiedChartData.length) return "empty";
    const first = unifiedChartData[0]?.strike;
    const last = unifiedChartData[unifiedChartData.length - 1]?.strike;
    return `${unifiedChartData.length}:${first}:${last}:${stockPrice ?? ""}`;
  }, [unifiedChartData, stockPrice]);

  useEffect(() => {
    resetView();
  }, [chartDataKey, resetView]);

  const showTooltipAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el || !chartStrikes.length) return;
      const rect = el.getBoundingClientRect();
      const strike = clientXToStrike(clientX, rect, viewportRef.current);
      const visible = strikesInViewport(chartStrikes, viewportRef.current);
      const point = nearestStrike(visible, strike);
      if (!point) return;
      setTooltip({
        point,
        x: clientX - rect.left,
        y: clientY - rect.top,
      });
    },
    [chartStrikes],
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
        if (Math.abs(dx) > 3 || Math.abs(dy) > TAP_THRESHOLD_PX) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            g.mode = "pan";
            g.moved = true;
            g.lastClientX = touch.clientX;
            setTooltip(null);
            e.preventDefault();
          }
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

    el.addEventListener("touchstart", onTouchStart, { passive: false });
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

  if (!unifiedChartData.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800 text-sm text-zinc-500">
        No strike data for this expiry.
      </div>
    );
  }

  const visibleUnified = unifiedChartData.filter((point) => {
    const min = Math.min(viewport.min, viewport.max);
    const max = Math.max(viewport.min, viewport.max);
    return point.strike >= min && point.strike <= max;
  });
  const barSeries = barSeriesFromUnified(visibleUnified);
  const profileSeries = profileSeriesFromUnified(visibleUnified);
  const strikeMin = Math.min(viewport.min, viewport.max);
  const strikeMax = Math.max(viewport.min, viewport.max);
  const strikeSpan = strikeMax - strikeMin || 1;

  const plotW = CHART_WIDTH - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const xAxis = createStrikeXScale(strikeMin, strikeMax, PAD.left, plotW);
  const xForStrike = (strike: number) => xAxis.toX(strike);

  const leftAxis = createBarYScale(
    barSeries.map((point) => point.netGex ?? 0),
    PAD.top,
    plotH,
  );
  const rightAxis = createProfileYScale(
    profileSeries.map((point) => point.profile),
    PAD.top,
    plotH,
  );

  const yForBar = (netGex: number) => leftAxis.toY(netGex);
  const yForProfile = (profile: number) => rightAxis.toY(profile);
  const zeroY = leftAxis.zeroY;

  const barWidth = Math.max(3, Math.min(14, (plotW / Math.max(barSeries.length, 1)) * 0.72));

  const profileLine = profileSeries
    .map((point) => `${xForStrike(point.strike)},${yForProfile(point.profile)}`)
    .join(" ");
  const profileFills = buildProfileFillPolygons(profileSeries, xForStrike, yForProfile, zeroY);

  const levels: LevelLine[] = (
    [
      { value: coerceStrike(putWall), label: "Put Wall", color: GEX_CHART_THEME.levelColors.putWall },
      { value: coerceStrike(gammaFlip), label: "Gamma Flip", color: GEX_CHART_THEME.levelColors.gammaFlip },
      { value: coerceStrike(callWall), label: "Call Wall", color: GEX_CHART_THEME.levelColors.callWall },
    ] as Array<{ value: number | null; label: string; color: string }>
  )
    .flatMap((level) =>
      level.value != null && level.value >= strikeMin && level.value <= strikeMax
        ? [{ value: level.value, label: level.label, color: level.color }]
        : [],
    )
    .sort((a, b) => a.value - b.value);

  const spotStrike = coerceStrike(stockPrice);

  const yTicks = leftAxis.ticks;
  const profileAxisTicks = rightAxis.ticks;
  const zoomed = isViewportZoomed(viewport, bounds);

  const reservedStrikes = [
    ...levels.map((level) => level.value),
    ...(spotStrike != null ? [spotStrike] : []),
  ];

  const minLabelSpacing = 56;
  const maxXTicks = Math.max(3, Math.floor(plotW / minLabelSpacing));
  const xTickStep = Math.max(1, Math.ceil(strikeSpan / maxXTicks / 5) * 5);
  const xTicks = computeBackgroundStrikeTicks(strikeMin, strikeMax, reservedStrikes, {
    step: xTickStep,
  });

  const plotBottom = PAD.top + plotH;
  const axisTickY = plotBottom + 16;
  const referenceBadgeBaseY = plotBottom + 16 + GEX_CHART_LAYOUT.referenceBadgeDy;

  const levelLabelLayouts = resolveLineLabelLayouts(
    levels.map((level) => ({ key: level.label, x: xForStrike(level.value) })),
    { labelFontSize: LABEL_FONT },
  );
  const levelLabelByKey = new Map(levelLabelLayouts.map((layout) => [layout.key, layout]));

  const bottomLabels = resolveBottomBadgeLayout(
    [
      ...levels.map((level) => ({
        key: level.label,
        x: xForStrike(level.value),
        text: formatStrike(level.value),
        color: level.color,
      })),
      ...(spotStrike != null && spotStrike >= strikeMin && spotStrike <= strikeMax
        ? [
            {
              key: "spot",
              x: xForStrike(spotStrike),
              text: formatStrike(spotStrike),
              color: "#eff6ff",
              pill: true,
            },
          ]
        : []),
    ],
    referenceBadgeBaseY,
    { minSpacingPx: 52, rowHeight: 24 },
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex flex-col gap-2 border-b border-zinc-800 px-3 py-3 text-sm text-zinc-400 sm:flex-row sm:items-center sm:justify-between sm:text-xs">
        <span>Pinch to zoom · Drag to pan · Tap a bar for details</span>
        {zoomed && (
          <button
            type="button"
            onClick={resetView}
            className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 sm:text-xs"
          >
            Reset zoom
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative h-[440px] w-full cursor-grab select-none active:cursor-grabbing sm:h-[340px]"
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

          <g data-y-axis-id={GEX_CHART_AXIS.left} aria-label="Net GEX axis">
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
                  <text x={PAD.left - 10} y={y + 5} textAnchor="end" fill="#d4d4d8" fontSize={AXIS_FONT} fontWeight="600">
                    {formatChartMoney(tick)}
                  </text>
                </g>
              );
            })}

            {barSeries.map((point) => {
              const x = xForStrike(point.strike) - barWidth / 2;
              const netGex = point.netGex ?? 0;
              const y1 = yForBar(netGex);
              const positive = netGex >= 0;
              const selected = tooltip?.point.strike === point.strike;
              return (
                <g
                  key={`bar-${point.strike}`}
                  onClick={(e) => onBarClick(unifiedChartToGexPoint(point), e)}
                  onMouseEnter={(e) => {
                    const el = containerRef.current;
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    setTooltip({
                      point: unifiedChartToGexPoint(point),
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
                    fill={positive ? GEX_CHART_THEME.barPositive : GEX_CHART_THEME.barNegative}
                    opacity={selected ? 1 : 0.85}
                    stroke={selected ? "#f4f4f5" : "none"}
                    strokeWidth={selected ? 1.5 : 0}
                  />
                </g>
              );
            })}
          </g>

          <g data-y-axis-id={GEX_CHART_AXIS.right} aria-label="Gamma profile axis">
            <line
              x1={CHART_WIDTH - PAD.right}
              y1={PAD.top}
              x2={CHART_WIDTH - PAD.right}
              y2={PAD.top + plotH}
              stroke={GEX_CHART_THEME.profileAxisColor}
              opacity={0.35}
            />

            {profileAxisTicks.map((tick, i) => (
              <text
                key={`pr-${i}`}
                x={CHART_WIDTH - PAD.right + 8}
                y={yForProfile(tick) + 5}
                textAnchor="start"
                fill={GEX_CHART_THEME.profileAxisColor}
                fontSize={AXIS_FONT}
                fontWeight="600"
              >
                {formatChartMoney(tick)}
              </text>
            ))}

            {profileFills.negative.map((points, index) => (
              <polygon
                key={`profile-fill-neg-${index}`}
                points={points}
                fill={GEX_CHART_THEME.profileFillNegative}
                opacity={GEX_CHART_THEME.profileFillOpacity}
                stroke="none"
              />
            ))}

            {profileFills.positive.map((points, index) => (
              <polygon
                key={`profile-fill-pos-${index}`}
                points={points}
                fill={GEX_CHART_THEME.profileFillPositive}
                opacity={GEX_CHART_THEME.profileFillOpacity}
                stroke="none"
              />
            ))}

            <polyline
              points={profileLine}
              fill="none"
              stroke={GEX_CHART_THEME.profileLineColor}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>

          {levels.map((level) => {
            const x = xForStrike(level.value);
            const layout = levelLabelByKey.get(level.label);
            const labelX = x + (layout?.dx ?? 0);
            const labelY = PAD.top - 10;
            return (
              <g key={`${level.label}-${level.value}`}>
                <line
                  x1={x}
                  y1={PAD.top}
                  x2={x}
                  y2={PAD.top + plotH}
                  stroke={level.color}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fill={GEX_CHART_THEME.levelLabelColor}
                  fontSize={LABEL_FONT}
                  fontWeight="700"
                  transform={`rotate(${layout?.rotate ?? -90} ${labelX} ${labelY})`}
                >
                  {level.label}
                </text>
              </g>
            );
          })}

          {bottomLabels.map((label) =>
            label.pill ? (
              <g key={label.key}>
                <rect
                  x={label.x - 34}
                  y={label.y - 18}
                  width={68}
                  height={26}
                  rx={13}
                  fill="#1d4ed8"
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fill={label.color}
                  fontSize={VALUE_FONT}
                  fontWeight="700"
                >
                  {label.text}
                </text>
              </g>
            ) : (
              <text
                key={label.key}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                fill={label.color}
                fontSize={VALUE_FONT}
                fontWeight="700"
              >
                {label.text}
              </text>
            ),
          )}

          {spotStrike != null && spotStrike >= strikeMin && spotStrike <= strikeMax && (
            <g>
              <line
                x1={xForStrike(spotStrike)}
                y1={PAD.top}
                x2={xForStrike(spotStrike)}
                y2={PAD.top + plotH}
                stroke="#3b82f6"
                strokeWidth={1}
                opacity={0.5}
              />
            </g>
          )}

          {xTicks.map((tick) => (
            <text
              key={`xs-${tick}`}
              x={xForStrike(tick)}
              y={axisTickY}
              textAnchor="middle"
              fill="#d4d4d8"
              fontSize={AXIS_FONT}
              fontWeight="600"
            >
              {formatStrike(tick)}
            </text>
          ))}
        </svg>

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 min-w-[200px] rounded-xl border border-zinc-600 bg-zinc-900/95 px-4 py-3.5 text-base shadow-xl"
            style={{
              left: Math.min(Math.max(tooltip.x + 12, 8), (containerRef.current?.clientWidth ?? 300) - 160),
              top: Math.max(tooltip.y - 72, 8),
            }}
          >
            <div className="text-lg font-bold text-zinc-100">Strike: {formatStrike(tooltip.point.strike)}</div>
            <div className={`mt-1.5 text-base font-semibold ${tooltip.point.netGex >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Net GEX: {formatChartMoney(tooltip.point.netGex, true)}
            </div>
            <div className="mt-1 text-base font-semibold text-amber-300">
              Gamma Profile: {formatChartMoney(tooltip.point.profile, true)}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-zinc-800 px-3 py-3 text-sm text-zinc-300 sm:text-xs sm:text-zinc-400">
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
          {visibleUnified.length} points · {formatStrike(strikeMin)}–{formatStrike(strikeMax)}
        </span>
      </div>
    </div>
  );
}
