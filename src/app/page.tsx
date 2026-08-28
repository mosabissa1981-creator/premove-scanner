"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import type { ScanResult, TickerAnalysis } from "@/lib/unusualwhales/types";
import { TickerCard } from "@/components/ticker-ui";

export default function ScannerPage() {
  const { apiKey, hasKey } = useApiKey();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    if (!apiKey) {
      setError("Add your API key first — tap Settings below.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/scan?limit=12", { headers: apiHeaders(apiKey) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  const ready = result?.results.filter((r) => r.tier === "ready") ?? [];
  const settingUp = result?.results.filter((r) => r.tier === "setting-up") ?? [];
  const early = result?.results.filter((r) => r.tier === "early") ?? [];

  return (
    <div className="space-y-6 pb-8">
      {!hasKey && (
        <Link
          href="/settings"
          className="block rounded-xl border border-red-500/40 bg-red-500/10 p-4"
        >
          <p className="font-semibold text-red-200">Step 1: Add your API key</p>
          <p className="mt-1 text-sm text-red-300/80">
            Tap here to paste your Unusual Whales trial key →
          </p>
        </Link>
      )}

      <section>
        <h1 className="text-xl font-bold">Today&apos;s Early Setups</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Finds stocks <strong className="text-zinc-300">before</strong> they move — flat price +
          hidden call flow + dark pool buildup. Not the hottest names after the fact.
        </p>
      </section>

      <button
        type="button"
        onClick={runScan}
        disabled={loading || !hasKey}
        className="w-full rounded-xl bg-emerald-500 py-4 text-base font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"
      >
        {loading ? "Finding early setups…" : "Find Early Setups"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          Scanning flat-price stocks with hidden flow… ~1 min
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Ready" value={ready.length} accent />
            <MiniStat label="Setting up" value={settingUp.length} />
            <MiniStat label="Early" value={early.length} />
          </div>

          {ready.length > 0 && (
            <Section
              title="Ready to Break"
              subtitle="At resistance with conviction — watch for volume"
              items={ready}
              onSelect={(t) => router.push(`/ticker/${t}`)}
            />
          )}
          {settingUp.length > 0 && (
            <Section
              title="Setting Up"
              subtitle="Smart money entering — add to watchlist"
              items={settingUp}
              onSelect={(t) => router.push(`/ticker/${t}`)}
            />
          )}
          {early.length > 0 && (
            <Section
              title="Early Accumulation"
              subtitle="Quiet buildup — too early to trade, monitor daily"
              items={early}
              onSelect={(t) => router.push(`/ticker/${t}`)}
            />
          )}

          {result.results.length === 0 && (
            <p className="text-center text-sm text-zinc-500">
              No strong setups right now. Try again after market open.
            </p>
          )}
        </>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
        <p className="font-medium text-zinc-400">How this is different</p>
        <ul className="mt-2 space-y-1.5">
          <li>❌ Old: scan highest options premium (already moved)</li>
          <li>✅ New: flat price + hidden call flow + dark pool first</li>
          <li>✅ Then: confirm with sweeps, resistance, GEX flip</li>
        </ul>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-3">
      <div className={`text-2xl font-bold ${accent ? "text-emerald-400" : "text-zinc-200"}`}>
        {value}
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  items,
  onSelect,
}: {
  title: string;
  subtitle: string;
  items: TickerAnalysis[];
  onSelect: (ticker: string) => void;
}) {
  return (
    <section>
      <h2 className="font-semibold text-zinc-200">{title}</h2>
      <p className="text-xs text-zinc-500">{subtitle}</p>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <TickerCard key={item.ticker} analysis={item} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
