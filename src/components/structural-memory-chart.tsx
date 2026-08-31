"use client";

import { useMemo } from "react";
import type { HistoricalGexRow } from "@/lib/db/historical-gex";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 240;
const PAD = { top: 24, right: 16, bottom: 36, left: 52 };

const SERIES = [
  { key: "gammaFlip" as const, label: "Gamma Flip", color: "#fbbf24" },
  { key: "putWall" as const, label: "Put Wall", color: "#f87171" },
  { key: "callWall" as const, label: "Call Wall", color: "#34d399" },
];

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

export function StructuralMemoryChart({ rows }: { rows: HistoricalGexRow[] }) {
  const plotW = CHART_WIDTH - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const { paths, yMin, yMax, xLabels } = useMemo(() => {
    if (!rows.length) {
      return { paths: [], yMin: 0, yMax: 1, xLabels: [] as string[] };
    }

    const values = rows.flatMap((row) =>
      [row.gammaFlip, row.putWall, row.callWall, row.spotPrice].filter(
        (value): value is number => value != null && Number.isFinite(value),
      ),
    );
    const minY = values.length ? Math.min(...values) : 0;
    const maxY = values.length ? Math.max(...values) : 1;
    const pad = Math.max((maxY - minY) * 0.06, 0.5);

    const toX = (index: number) =>
      PAD.left + (rows.length <= 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW);
    const toY = (value: number) => {
      const span = maxY + pad - (minY - pad) || 1;
      return PAD.top + plotH - ((value - (minY - pad)) / span) * plotH;
    };

    const built = SERIES.map((series) => {
      const pts = rows
        .map((row, index) => {
          const value = row[series.key];
          if (value == null) return null;
          return { x: toX(index), y: toY(value) };
        })
        .filter((point): point is { x: number; y: number } => point != null);
      return { ...series, d: smoothPath(pts) };
    });

    return {
      paths: built,
      yMin: minY - pad,
      yMax: maxY + pad,
      xLabels: rows.map((row) => row.date.slice(5)),
    };
  }, [rows, plotH, plotW]);

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
        No structural memory yet — daily GEX snapshots populate after market close.
      </p>
    );
  }

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-auto w-full max-w-full"
        role="img"
        aria-label="15-day GEX level evolution"
      >
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="#09090b"
          stroke="#3f3f46"
        />

        {yTicks.map((tick) => {
          const span = yMax - yMin || 1;
          const y = PAD.top + plotH - ((tick - yMin) / span) * plotH;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y}
                y2={y}
                stroke="#27272a"
                strokeDasharray="4 4"
              />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#a1a1aa" fontSize={11}>
                ${tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        {paths.map((series) =>
          series.d ? (
            <path
              key={series.key}
              d={series.d}
              fill="none"
              stroke={series.color}
              strokeWidth={2.5}
            />
          ) : null,
        )}

        {xLabels.map((label, index) => {
          const x =
            PAD.left +
            (rows.length <= 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW);
          return (
            <text key={`${label}-${index}`} x={x} y={CHART_HEIGHT - 10} textAnchor="middle" fill="#a1a1aa" fontSize={10}>
              {label}
            </text>
          );
        })}

        {SERIES.map((series, index) => (
          <g key={series.key} transform={`translate(${PAD.left + index * 108}, 12)`}>
            <line x1={0} x2={18} y1={6} y2={6} stroke={series.color} strokeWidth={2.5} />
            <text x={24} y={10} fill="#d4d4d8" fontSize={11}>
              {series.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
