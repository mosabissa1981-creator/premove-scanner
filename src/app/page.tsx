"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import type { ScanResult, TickerAnalysis } from "@/lib/unusualwhales/types";
import { TickerCard } from "@/components/ticker-ui";
import { TickerSearch } from "@/components/ticker-search";

export default function ScannerPage() {
  const { apiKey, hasKey } = useApiKey();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    if (!hasKey) {
      setError("Add your API key first — tap Settings below.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/scan?limit=12", {
        headers: apiHeaders(apiKey),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [apiKey, hasKey]);

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
        <h1 className="text-xl font-bold">Swing Trade Setups</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Multi-day swing candidates — flat price + hidden flow before the move.
          Hold <strong className="text-zinc-300">3–15 days</strong>, not scalps.
        </p>
      </section>

      <section className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Look up any stock
        </label>
        <TickerSearch />
      </section>

      <button
        type="button"
        onClick={runScan}
        disabled={loading || !hasKey}
        className="w-full rounded-xl bg-emerald-500 py-4 text-base font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"
      >
        {loading ? "Scanning swing setups…" : "Find Swing Setups"}
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
          <p className="text-center text-xs text-zinc-500">
            Scanned {result.candidatesScreened} candidates
            {result.scannedAt && (
              <> · {new Date(result.scannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
            )}
          </p>

          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Ready" value={ready.length} accent />
            <MiniStat label="Setting up" value={settingUp.length} />
            <MiniStat label="Early" value={early.length} />
          </div>

          {ready.length > 0 && (
            <Section
              title="Ready to Swing"
              subtitle="Breakout zone — enter on daily close above resistance (3–10 day hold)"
              items={ready}
              onSelect={(t) => router.push(`/ticker/${t}`)}
            />
          )}
          {settingUp.length > 0 && (
            <Section
              title="Watchlist — Setting Up"
              subtitle="Smart money loading — wait for breakout (5–15 day swing)"
              items={settingUp}
              onSelect={(t) => router.push(`/ticker/${t}`)}
            />
          )}
          {early.length > 0 && (
            <Section
              title="Early — Too Soon"
              subtitle="Accumulation phase — monitor daily, no entry yet"
              items={early}
              onSelect={(t) => router.push(`/ticker/${t}`)}
            />
          )}

          {result.results.length === 0 && (
            <p className="text-center text-sm text-zinc-500">
              No strong setups right now. Try again after market open.
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              {result.errors.length} ticker{result.errors.length !== 1 ? "s" : ""} skipped:{" "}
              {result.errors.slice(0, 3).join(" · ")}
              {result.errors.length > 3 && ` (+${result.errors.length - 3} more)`}
            </div>
          )}
        </>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
        <p className="font-medium text-zinc-400">Swing trade playbook</p>
        <ul className="mt-2 space-y-1.5">
          <li>✅ <strong className="text-zinc-400">Ready to Swing</strong> — enter on breakout, hold 3–10 days</li>
          <li>👀 <strong className="text-zinc-400">Setting Up</strong> — watchlist, enter when it hits Ready</li>
          <li>⏳ <strong className="text-zinc-400">Early</strong> — too soon, check back daily</li>
          <li>🔄 Re-scan each morning — setups change as flow builds</li>
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
