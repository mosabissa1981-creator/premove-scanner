"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import type { ScanResult, TickerAnalysis } from "@/lib/quantdata/types";
import { TickerCard } from "@/components/ticker-ui";

export default function ScannerPage() {
  const { apiKey } = useApiKey();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(15);
  const [minPremium, setMinPremium] = useState(1_000_000);

  const runScan = useCallback(async () => {
    if (!apiKey) {
      setError("Add your Quant Data API key in Settings first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        minPremium: String(minPremium),
      });
      const res = await fetch(`/api/scan?${params}`, {
        headers: apiHeaders(apiKey),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [apiKey, limit, minPremium]);

  const handleSelect = (ticker: string) => {
    router.push(`/ticker/${ticker}`);
  };

  const highConviction = result?.results.filter((r) => r.tier === "high") ?? [];
  const medium = result?.results.filter((r) => r.tier === "medium") ?? [];
  const watch = result?.results.filter((r) => r.tier === "watch") ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Pre-Move Confluence Scanner</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Scans top options activity for volatility coils, dark pool accumulation, bullish
          flow, IV anomalies, and GEX flip proximity — the signals that fire before big moves.
        </p>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Tickers to analyze</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            >
              <option value={10}>Top 10</option>
              <option value={15}>Top 15</option>
              <option value={20}>Top 20</option>
              <option value={25}>Top 25</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Min options premium</label>
            <select
              value={minPremium}
              onChange={(e) => setMinPremium(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            >
              <option value={500000}>$500K+</option>
              <option value={1000000}>$1M+</option>
              <option value={3000000}>$3M+</option>
              <option value={5000000}>$5M+</option>
            </select>
          </div>
          <button
            type="button"
            onClick={runScan}
            disabled={loading}
            className="rounded-lg bg-emerald-500 px-6 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Run Scan"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-3 text-sm text-zinc-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
            Analyzing tickers via Quant Data API… this takes 1–3 minutes.
          </div>
        )}
      </section>

      {result && (
        <>
          <section className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Scanned" value={String(result.candidatesScreened)} />
            <StatCard label="High Conviction" value={String(highConviction.length)} accent />
            <StatCard label="Medium" value={String(medium.length)} />
            <StatCard
              label="Last scan"
              value={new Date(result.scannedAt).toLocaleTimeString()}
            />
          </section>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {result.errors.length} ticker(s) failed: {result.errors.slice(0, 3).join("; ")}
            </div>
          )}

          {highConviction.length > 0 && (
            <ResultSection title="High Conviction (Score 6+)" items={highConviction} onSelect={handleSelect} />
          )}
          {medium.length > 0 && (
            <ResultSection title="Medium (Score 4–5)" items={medium} onSelect={handleSelect} />
          )}
          {watch.length > 0 && (
            <ResultSection title="Watch List (Score 2–3)" items={watch} onSelect={handleSelect} />
          )}
        </>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-5">
        <h2 className="text-sm font-semibold text-zinc-300">How scoring works</h2>
        <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreExplainer label="Volatility Coil" points="+1" desc="BB squeeze, range tightening" />
          <ScoreExplainer label="Dark Pool" points="+1" desc="Off-exchange accumulation" />
          <ScoreExplainer label="Bullish Flow" points="+2" desc="Call premium or sweeps" />
          <ScoreExplainer label="IV / GEX / Technical" points="+1 each" desc="Pre-move confirmation" />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-emerald-400" : "text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}

function ResultSection({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: TickerAnalysis[];
  onSelect: (ticker: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <TickerCard key={item.ticker} analysis={item} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function ScoreExplainer({
  label,
  points,
  desc,
}: {
  label: string;
  points: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-emerald-500">{points}</span>
      </div>
      <p className="mt-0.5">{desc}</p>
    </div>
  );
}
