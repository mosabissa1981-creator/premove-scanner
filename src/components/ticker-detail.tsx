"use client";

import type { TickerAnalysis } from "@/lib/unusualwhales/types";
import { ScoreRing, SignalList, TierBadge } from "@/components/ticker-ui";
import { addToWatchlist, removeFromWatchlist, useIsOnWatchlist } from "@/lib/watchlist";

export function WatchlistButton({ ticker }: { ticker: string }) {
  const onList = useIsOnWatchlist(ticker);

  const toggle = () => {
    if (onList) {
      removeFromWatchlist(ticker);
    } else {
      addToWatchlist(ticker);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
        onList
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
      }`}
    >
      {onList ? "★ On Watchlist" : "☆ Add to Watchlist"}
    </button>
  );
}

export function TickerDetailView({ analysis }: { analysis: TickerAnalysis }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{analysis.ticker}</h1>
            <TierBadge tier={analysis.tier} label={analysis.phaseLabel} />
          </div>
          {analysis.companyName && (
            <p className="mt-1 text-zinc-400">{analysis.companyName}</p>
          )}
          {analysis.stockPrice != null && analysis.stockPrice > 0 && (
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              ${analysis.stockPrice.toFixed(2)}
              <span
                className={`ml-2 text-sm ${analysis.priceChangePct >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {analysis.priceChangePct >= 0 ? "+" : ""}
                {analysis.priceChangePct.toFixed(1)}% (30d)
              </span>
            </p>
          )}
        </div>
        <ScoreRing score={analysis.score} maxScore={analysis.maxScore} />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
          {analysis.holdTime}
        </span>
        {analysis.sector && (
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
            {analysis.sector}
          </span>
        )}
        {analysis.earningsSoon && (
          <span className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-medium text-orange-300">
            ⚠︎ Earnings
            {analysis.earningsInDays != null ? ` in ${analysis.earningsInDays}d` : " soon"}
          </span>
        )}
      </div>

      {analysis.earningsSoon && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          Earnings fall inside the swing window — the elevated IV is likely pricing the
          event, not organic accumulation. Treat the IV signal with caution.
        </div>
      )}

      {(analysis.resistanceLevel || analysis.stopLevel) && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-300">Swing levels</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {analysis.resistanceLevel && (
              <LevelCard
                label="Entry trigger (resistance)"
                value={`$${analysis.resistanceLevel.toFixed(2)}`}
                hint="Enter on daily close above this level with volume"
              />
            )}
            {analysis.stopLevel && analysis.stockPrice && (
              <LevelCard
                label="Suggested stop"
                value={`$${analysis.stopLevel.toFixed(2)}`}
                hint={`${(((analysis.stockPrice - analysis.stopLevel) / analysis.stockPrice) * 100).toFixed(1)}% below current`}
              />
            )}
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Options Premium" value={`$${(analysis.premium / 1e6).toFixed(2)}M`} />
        <Metric label="Coil Score" value={`${analysis.coilScore}/100`} />
        <Metric
          label="Dark Pool (5d)"
          value={`$${(analysis.darkPoolNotional / 1e6).toFixed(1)}M`}
        />
        <Metric
          label="IV Rank"
          value={analysis.ivRank !== null ? `${analysis.ivRank.toFixed(0)}%` : "N/A"}
        />
      </div>

      <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <h2 className="text-sm font-semibold text-zinc-300">What to do</h2>
        <p className="mt-2 text-sm text-emerald-300">{analysis.action}</p>
      </section>

      {analysis.gex && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-300">GEX Levels</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <GexMetric label="Regime" value={analysis.gex.regime} />
            <GexMetric
              label="Gamma Flip"
              value={analysis.gex.gammaFlip ? `$${analysis.gex.gammaFlip.toFixed(2)}` : "N/A"}
            />
            <GexMetric
              label="Call Wall"
              value={analysis.gex.callWall ? `$${analysis.gex.callWall.toFixed(2)}` : "N/A"}
            />
            <GexMetric
              label="Put Wall"
              value={analysis.gex.putWall ? `$${analysis.gex.putWall.toFixed(2)}` : "N/A"}
            />
          </div>
          {analysis.gex.flipDistancePct !== null && (
            <p className="mt-3 text-xs text-zinc-500">
              {Math.abs(analysis.gex.flipDistancePct).toFixed(1)}% from gamma flip —{" "}
              {Math.abs(analysis.gex.flipDistancePct) <= 2
                ? "regime change imminent"
                : "monitor for approach"}
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold text-zinc-300">Confluence Signals</h2>
        <SignalList signals={analysis.signals} />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function GexMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-medium capitalize text-zinc-200">{value}</div>
    </div>
  );
}

function LevelCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{value}</div>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}
