"use client";

import { GexStrikeChart } from "@/components/gex-strike-chart";
import { formatMoney, formatPrice } from "@/lib/format";
import type { GexStudyResult } from "@/lib/unusualwhales/types";

export function TickerGexPanel({ study }: { study: GexStudyResult }) {
  return (
    <section className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300">Gamma Profile &amp; Walls</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Strike GEX bars and simulated profile — same engine as GEX Study (
            <code className="text-zinc-400">gamma-math.ts</code>)
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          Expiry {study.expiry} · {study.profileSource} profile
        </p>
      </div>

      <GexStrikeChart
        strikes={study.strikes}
        stockPrice={study.stockPrice}
        putWall={study.putWall}
        gammaFlip={study.gammaFlip}
        callWall={study.callWall}
      />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Gamma Exposure Stats
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Net GEX ($ / 1% move)" value={formatMoney(study.netGex)} accent={study.netGex >= 0 ? "emerald" : "red"} />
          <Stat label="Call GEX" value={formatMoney(study.callGex)} accent="emerald" />
          <Stat label="Put GEX" value={formatMoney(study.putGex)} accent="red" />
          <Stat label="Put Wall" value={formatPrice(study.putWall)} accent="red" />
          <Stat label="Gamma Flip" value={formatPrice(study.gammaFlip)} />
          <Stat label="Call Wall" value={formatPrice(study.callWall)} accent="emerald" />
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red";
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "red"
        ? "text-red-400"
        : "text-zinc-100";

  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums sm:text-xl ${valueClass}`}>{value}</div>
    </div>
  );
}
