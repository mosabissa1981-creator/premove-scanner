"use client";

import { useMemo } from "react";
import type { IvSmilePoint } from "@/lib/unusualwhales/types";
import { createStrikeXScale } from "@/utils/chart-domain";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 320;
const PAD = { top: 28, right: 48, bottom: 44, left: 56 };

function smoothPath(points: { x: number; y: number }[]): string {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    path += ` Q ${cx} ${prev.y} ${curr.x} ${curr.y}`;
  }
  return path;
}

export function IvSmileChart({
  points,
  stockPrice,
  strikeMin,
  strikeMax,
}: {
  points: IvSmilePoint[];
  stockPrice: number | null;
  strikeMin?: number;
  strikeMax?: number;
}) {
  const plotW = CHART_WIDTH - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const { callSeries, putSeries, ivMin, ivMax, domainMin, domainMax } = useMemo(() => {
    const calls = points.filter((point) => point.type === "call" && point.iv > 0);
    const puts = points.filter((point) => point.type === "put" && point.iv > 0);
    const allIv = points.map((point) => point.iv).filter((iv) => iv > 0);
    const strikes = points.map((point) => point.strike);

    const minStrike = strikeMin ?? (strikes.length ? Math.min(...strikes) : 0);
    const maxStrike = strikeMax ?? (strikes.length ? Math.max(...strikes) : 1);
    const minIv = allIv.length ? Math.min(...allIv) : 0;
    const maxIv = allIv.length ? Math.max(...allIv) : 100;
    const ivPad = Math.max((maxIv - minIv) * 0.08, 1);

    return {
      callSeries: calls,
      putSeries: puts,
      ivMin: Math.max(0, minIv - ivPad),
      ivMax: maxIv + ivPad,
      domainMin: minStrike,
      domainMax: maxStrike,
    };
  }, [points, strikeMin, strikeMax]);

  const xScale = useMemo(
    () => createStrikeXScale(domainMin, domainMax, PAD.left, plotW),
    [domainMin, domainMax, plotW],
  );
  const toX = xScale.toX;

  const toY = (iv: number) => {
    const span = ivMax - ivMin || 1;
    return PAD.top + plotH - ((iv - ivMin) / span) * plotH;
  };

  const callPath = smoothPath(
    callSeries.map((point) => ({ x: toX(point.strike), y: toY(point.iv) })),
  );
  const putPath = smoothPath(
    putSeries.map((point) => ({ x: toX(point.strike), y: toY(point.iv) })),
  );

  const yTicks = [ivMin, (ivMin + ivMax) / 2, ivMax];
  const xTicks = [domainMin, (domainMin + domainMax) / 2, domainMax];

  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-auto w-full max-w-full"
        role="img"
        aria-label="Implied volatility smile"
      >
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="#09090b"
          stroke="#3f3f46"
          strokeWidth={1}
        />

        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="#27272a"
              strokeDasharray="4 4"
            />
            <text
              x={PAD.left - 8}
              y={toY(tick) + 4}
              textAnchor="end"
              fill="#a1a1aa"
              fontSize={11}
            >
              {tick.toFixed(0)}%
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <text
            key={`x-${tick}`}
            x={toX(tick)}
            y={CHART_HEIGHT - 12}
            textAnchor="middle"
            fill="#a1a1aa"
            fontSize={11}
          >
            {Number.isInteger(tick) ? tick : tick.toFixed(2)}
          </text>
        ))}

        {stockPrice != null && stockPrice >= domainMin && stockPrice <= domainMax && (
          <line
            x1={toX(stockPrice)}
            x2={toX(stockPrice)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="#71717a"
            strokeDasharray="3 3"
          />
        )}

        {callPath && (
          <path d={callPath} fill="none" stroke="#34d399" strokeWidth={2.5} />
        )}
        {putPath && <path d={putPath} fill="none" stroke="#f87171" strokeWidth={2.5} />}

        <text x={PAD.left + 8} y={PAD.top + 14} fill="#34d399" fontSize={12} fontWeight={600}>
          Call IV
        </text>
        <text x={PAD.left + 72} y={PAD.top + 14} fill="#f87171" fontSize={12} fontWeight={600}>
          Put IV
        </text>
      </svg>
    </div>
  );
}
