import type { SignalDetail, TickerAnalysis } from "@/lib/unusualwhales/types";

const tierStyles = {
  ready: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "setting-up": "bg-sky-500/20 text-sky-300 border-sky-500/40",
  early: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  watch: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
};

const phaseColors = {
  accumulation: "text-amber-400",
  conviction: "text-sky-400",
  ignition: "text-emerald-400",
  amplify: "text-violet-400",
};

export function TierBadge({ tier, label }: { tier: TickerAnalysis["tier"]; label?: string }) {
  const labels = {
    ready: "Ready to Break",
    "setting-up": "Setting Up",
    early: "Early",
    watch: "Watch",
  };

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tierStyles[tier]}`}>
      {label ?? labels[tier]}
    </span>
  );
}

export function ScoreRing({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const color =
    score >= 8 ? "text-emerald-400" : score >= 5 ? "text-sky-400" : "text-amber-400";

  return (
    <div className="flex flex-col items-center">
      <div className={`text-3xl font-bold tabular-nums ${color}`}>{score}</div>
      <div className="text-xs text-zinc-500">/ {maxScore}</div>
      <div className="mt-2 h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${score >= 8 ? "bg-emerald-500" : score >= 5 ? "bg-sky-500" : "bg-amber-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SignalList({ signals }: { signals: SignalDetail[] }) {
  const phases = ["accumulation", "conviction", "ignition", "amplify"] as const;
  const phaseLabels = {
    accumulation: "1 · Accumulation (before move)",
    conviction: "2 · Conviction (smart money)",
    ignition: "3 · Ignition (entry zone)",
    amplify: "4 · Amplify (GEX fuel)",
  };

  return (
    <div className="space-y-4">
      {phases.map((phase) => {
        const phaseSignals = signals.filter((s) => s.phase === phase);
        if (phaseSignals.length === 0) return null;
        const anyTriggered = phaseSignals.some((s) => s.triggered);

        return (
          <div key={phase}>
            <h3
              className={`mb-2 text-xs font-semibold uppercase tracking-wide ${anyTriggered ? phaseColors[phase] : "text-zinc-600"}`}
            >
              {phaseLabels[phase]}
            </h3>
            <ul className="space-y-2">
              {phaseSignals.map((signal) => (
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
                      <span
                        className={
                          signal.triggered ? "font-medium text-zinc-100" : "text-zinc-400"
                        }
                      >
                        {signal.label}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">+{signal.points}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{signal.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function TickerCard({
  analysis,
  onSelect,
}: {
  analysis: TickerAnalysis;
  onSelect?: (ticker: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(analysis.ticker)}
      className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-zinc-100">{analysis.ticker}</span>
            <TierBadge tier={analysis.tier} label={analysis.phaseLabel} />
          </div>
          {analysis.companyName && (
            <p className="mt-0.5 truncate text-sm text-zinc-500">{analysis.companyName}</p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">{analysis.action}</p>
        </div>
        <ScoreRing score={analysis.score} maxScore={analysis.maxScore} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {analysis.inCoilScreener && (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
            Flat + calls
          </span>
        )}
        {analysis.inFlowAlerts && (
          <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-400">
            Flow alert
          </span>
        )}
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
          Coil {analysis.coilScore}
        </span>
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
          {analysis.priceChangePct >= 0 ? "+" : ""}
          {analysis.priceChangePct.toFixed(1)}%
        </span>
      </div>
    </button>
  );
}
