"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import {
  getWatchlist,
  removeFromWatchlist,
} from "@/components/ticker-detail";
import { TickerCard } from "@/components/ticker-ui";
import type { TickerAnalysis } from "@/lib/unusualwhales/types";

export default function WatchlistPage() {
  const { apiKey, hasKey } = useApiKey();
  const router = useRouter();
  const [tickers, setTickers] = useState<string[]>([]);
  const [results, setResults] = useState<TickerAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(() => {
    setTickers(getWatchlist());
  }, []);

  const refreshScores = useCallback(async () => {
    const list = getWatchlist();
    setTickers(list);
    if (!hasKey || list.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders(apiKey),
        },
        body: JSON.stringify({ tickers: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      setResults(data.results ?? []);
      if (data.errors?.length) {
        setError(`Some tickers failed: ${data.errors.join(", ")}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }, [apiKey, hasKey]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (tickers.length > 0 && hasKey) {
      void refreshScores();
    }
  }, [tickers.length, hasKey, refreshScores]);

  const handleRemove = (ticker: string) => {
    removeFromWatchlist(ticker);
    setTickers(getWatchlist());
    setResults((prev) => prev.filter((r) => r.ticker !== ticker));
  };

  if (tickers.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
        <h1 className="text-xl font-bold">Swing Watchlist</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Run a scan and add tickers from the detail page. Refresh daily for updated scores.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-black"
        >
          Go to Scanner
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Swing Watchlist</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {tickers.length} ticker{tickers.length !== 1 ? "s" : ""} — refresh each morning
          </p>
        </div>
        <button
          type="button"
          onClick={refreshScores}
          disabled={loading || !hasKey}
          className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-40"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!hasKey && (
        <Link href="/settings" className="block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Add API key to refresh live scores →
        </Link>
      )}

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      {loading && results.length === 0 && (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          Loading swing scores…
        </div>
      )}

      <div className="space-y-3">
        {(results.length > 0 ? results : tickers.map((t) => ({ ticker: t }))).map((item) => (
          <div key={item.ticker} className="relative">
            {"score" in item ? (
              <TickerCard
                analysis={item as TickerAnalysis}
                onSelect={(t) => router.push(`/ticker/${t}`)}
              />
            ) : (
              <Link
                href={`/ticker/${item.ticker}`}
                className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <span className="text-lg font-bold">{item.ticker}</span>
                <p className="mt-1 text-xs text-zinc-500">Tap to analyze</p>
              </Link>
            )}
            <button
              type="button"
              onClick={() => handleRemove(item.ticker)}
              className="absolute right-3 top-3 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
