"use client";

import type { GexStrikePoint } from "@/lib/unusualwhales/types";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 300;
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

export function GexStrikeChart({
  strikes,
  stockPrice,
  putWall,
  gammaFlip,
  callWall,
}: GexStrikeChartProps) {
  if (!strikes.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800 text-sm text-zinc-500">
        No strike data for this expiry.
      </div>
    );
  }

  const plotW = CHART_WIDTH - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
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

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/60">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="min-w-[320px] w-full"
        role="img"
        aria-label="Gamma exposure by strike"
      >
        <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="transparent" />

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
            x={CHART_WIDTH - PAD.right + 6}
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

        {strikes
          .filter((_, i) => i % Math.ceil(strikes.length / 8) === 0 || i === strikes.length - 1)
          .map((point) => (
            <text
              key={`xs-${point.strike}`}
              x={xForStrike(point.strike)}
              y={CHART_HEIGHT - 22}
              textAnchor="middle"
              fill="#71717a"
              fontSize="10"
            >
              {formatStrike(point.strike)}
            </text>
          ))}
      </svg>

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
