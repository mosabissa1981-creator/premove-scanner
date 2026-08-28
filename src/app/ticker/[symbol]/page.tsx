"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import type { TickerAnalysis } from "@/lib/unusualwhales/types";
import { TickerDetailView, WatchlistButton } from "@/components/ticker-detail";

export default function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { apiKey, hasKey } = useApiKey();
  const [symbol, setSymbol] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TickerAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setSymbol(p.symbol.toUpperCase()));
  }, [params]);

  useEffect(() => {
    if (!symbol) return;
    if (!apiKey && !hasKey) {
      setError("Add your Unusual Whales API key in Settings.");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/ticker/${symbol}`, {
      headers: apiHeaders(apiKey),
      credentials: "same-origin",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setAnalysis(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [symbol, apiKey, hasKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <p className="text-red-300">{error ?? "Ticker not found"}</p>
        <Link href="/settings" className="mt-4 inline-block text-sm text-emerald-400 underline">
          Configure API key
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Back to Scanner
      </Link>
      <WatchlistButton ticker={analysis.ticker} />
      <TickerDetailView analysis={analysis} />
    </div>
  );
}
