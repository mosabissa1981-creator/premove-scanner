"use client";

import { useState } from "react";
import Link from "next/link";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import { cleanErrorMessage } from "@/lib/format-error";
import type { BacktestRow, BacktestSummary } from "@/lib/backtest/backtest";

interface BacktestResponse {
  date: string;
  horizon: number;
  summary: BacktestSummary;
  rows: BacktestRow[];
  errors?: string[];
}

function defaultDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 15);
  return d.toISOString().slice(0, 10);
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default function BacktestPage() {
  const { apiKey, hasKey } = useApiKey();
  const [date, setDate] = useState(defaultDate);
  const [horizon, setHorizon] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BacktestResponse | null>(null);

  const run = async () => {
    if (!hasKey) {
      setError("Add your Unusual Whales API key in Settings first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backtest?date=${date}&horizon=${horizon}&limit=25`,
        { headers: apiHeaders(apiKey), credentials: "same-origin" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Backtest failed");
      setData(json as BacktestResponse);
    } catch (err) {
      setError(cleanErrorMessage(err instanceof Error ? err.message : "Backtest failed"));
    } finally {
      setLoading(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6 pb-8">
      <section>
        <h1 className="text-xl font-bold">Backtest</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Measures whether the discovery screens (flat price + call premium, and flat price +
          rising open interest) actually preceded gains. It computes the forward return from a
          past date over your chosen horizon.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Scope: validates the <em>discovery premise</em>, not the full confluence score
          (historical dark pool / GEX aren&apos;t available). Use recent dates so daily price
          history covers the horizon.
        </p>
      </section>

      {!hasKey && (
        <Link
          href="/settings"
          className="block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          Add your API key to run a backtest →
        </Link>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Entry date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Horizon (days)
          <input
            type="number"
            min={1}
            max={30}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={loading || !hasKey}
          className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"
        >
          {loading ? "Running…" : "Run backtest"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Picks evaluated" value={`${summary.evaluated}/${summary.picks}`} />
            <Stat label="Win rate" value={`${Math.round(summary.winRate * 100)}%`} accent />
            <Stat label="Avg return" value={pct(summary.avgReturn)} />
            <Stat label="Median return" value={pct(summary.medianReturn)} />
          </div>

          {Object.keys(summary.bySource).length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-sm font-semibold text-zinc-300">By discovery bucket</h2>
              <div className="mt-3 space-y-2">
                {Object.entries(summary.bySource).map(([source, s]) => (
                  <div key={source} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">{source}</span>
                    <span className="tabular-nums text-zinc-300">
                      {s.evaluated} picks · {Math.round(s.winRate * 100)}% win · {pct(s.avgReturn)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {data?.rows.map((row) => (
              <div
                key={row.ticker}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5"
              >
                <div>
                  <span className="font-semibold text-zinc-100">{row.ticker}</span>
                  <span className="ml-2 text-[10px] text-zinc-500">{row.source}</span>
                </div>
                <span
                  className={`tabular-nums text-sm font-semibold ${
                    row.forwardReturn === null
                      ? "text-zinc-600"
                      : row.forwardReturn >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                  }`}
                >
                  {row.forwardReturn === null ? "no data" : pct(row.forwardReturn)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-center">
      <div className={`text-xl font-bold tabular-nums ${accent ? "text-emerald-400" : "text-zinc-200"}`}>
        {value}
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}
