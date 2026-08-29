"use client";

import { useEffect, useState } from "react";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import type { MarketSentiment } from "@/lib/scoring/market-tide";

interface TideResponse {
  available: boolean;
  sentiment?: MarketSentiment;
  label?: string;
  recommendation?: string;
}

const styles: Record<MarketSentiment, string> = {
  bullish: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  neutral: "border-zinc-700 bg-zinc-900/50 text-zinc-300",
  bearish: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

const dot: Record<MarketSentiment, string> = {
  bullish: "bg-emerald-500",
  neutral: "bg-zinc-500",
  bearish: "bg-amber-500",
};

export function MarketTideBanner() {
  const { apiKey, hasKey } = useApiKey();
  const [tide, setTide] = useState<TideResponse | null>(null);

  useEffect(() => {
    if (!hasKey) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/market-tide", {
          headers: apiHeaders(apiKey),
          credentials: "same-origin",
        });
        const data = (await res.json()) as TideResponse;
        if (!cancelled) setTide(data);
      } catch {
        if (!cancelled) setTide({ available: false });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [apiKey, hasKey]);

  if (!tide?.available || !tide.sentiment) return null;

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles[tide.sentiment]}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[tide.sentiment]}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{tide.label}</p>
        {tide.recommendation && (
          <p className="mt-0.5 text-xs opacity-80">{tide.recommendation}</p>
        )}
      </div>
    </div>
  );
}
