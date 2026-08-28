import type { SignalDetail, TickerAnalysis } from "@/lib/unusualwhales/types";

export function TierBadge({ tier }: { tier: TickerAnalysis["tier"] }) {
  const styles = {
    high: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    medium: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    watch: "bg-sky-500/20 text-sky-300 border-sky-500/40",
    low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
  };

  const labels = {
    high: "High Conviction",
    medium: "Medium",
    watch: "Watch",
    low: "Low",
  };

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[tier]}`}>
      {labels[tier]}
    </span>
  );
}

export function ScoreRing({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const color =
    score >= 6 ? "text-emerald-400" : score >= 4 ? "text-amber-400" : "text-sky-400";

  return (
    <div className="flex flex-col items-center">
      <div className={`text-3xl font-bold tabular-nums ${color}`}>{score}</div>
      <div className="text-xs text-zinc-500">/ {maxScore}</div>
      <div className="mt-2 h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${score >= 6 ? "bg-emerald-500" : score >= 4 ? "bg-amber-500" : "bg-sky-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SignalList({ signals }: { signals: SignalDetail[] }) {
  return (
    <ul className="space-y-2">
      {signals.map((signal) => (
        <li
          key={signal.id}
          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
            signal.triggered
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-zinc-800 bg-zinc-900/50"
          }`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              signal.triggered
                ? "bg-emerald-500 text-black"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {signal.triggered ? "✓" : "·"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className={signal.triggered ? "font-medium text-zinc-100" : "text-zinc-400"}>
                {signal.label}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">+{signal.points}</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{signal.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TickerCard({
  analysis,
  onSelect,
}: {
  analysis: TickerAnalysis;
  onSelect?: (ticker: string) => void;
}) {
  const triggered = analysis.signals.filter((s) => s.triggered).length;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(analysis.ticker)}
      className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-zinc-100">{analysis.ticker}</span>
            <TierBadge tier={analysis.tier} />
          </div>
          {analysis.companyName && (
            <p className="mt-0.5 text-sm text-zinc-500">{analysis.companyName}</p>
          )}
          {analysis.sector && (
            <p className="text-xs text-zinc-600">{analysis.sector}</p>
          )}
        </div>
        <ScoreRing score={analysis.score} maxScore={analysis.maxScore} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-zinc-800/50 px-2 py-1.5">
          <div className="text-zinc-500">Coil</div>
          <div className="font-semibold text-zinc-200">{analysis.coilScore}</div>
        </div>
        <div className="rounded-lg bg-zinc-800/50 px-2 py-1.5">
          <div className="text-zinc-500">Dark Pool</div>
          <div className="font-semibold text-zinc-200">
            ${(analysis.darkPoolNotional / 1e6).toFixed(1)}M
          </div>
        </div>
        <div className="rounded-lg bg-zinc-800/50 px-2 py-1.5">
          <div className="text-zinc-500">Signals</div>
          <div className="font-semibold text-zinc-200">{triggered}/7</div>
        </div>
      </div>

      {analysis.gex && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">
            GEX: {analysis.gex.regime}
          </span>
          {analysis.gex.gammaFlip && (
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">
              Flip ${analysis.gex.gammaFlip.toFixed(0)}
            </span>
          )}
          {analysis.gex.callWall && (
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">
              Call wall ${analysis.gex.callWall.toFixed(0)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
