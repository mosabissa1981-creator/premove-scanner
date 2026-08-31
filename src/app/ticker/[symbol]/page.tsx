"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import type { GexStudyResult, TickerAnalysis } from "@/lib/unusualwhales/types";
import { TickerDetailView, WatchlistButton } from "@/components/ticker-detail";
import { TickerGexPanel } from "@/components/ticker-gex-panel";
import { ConfluenceContextWidget } from "@/components/ticker-ui";
import { cleanErrorMessage } from "@/lib/format-error";

export default function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { apiKey, hasKey } = useApiKey();
  const [symbol, setSymbol] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TickerAnalysis | null>(null);
  const [study, setStudy] = useState<GexStudyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [gexError, setGexError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setSymbol(p.symbol.toUpperCase()));
  }, [params]);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    async function load(currentSymbol: string) {
      if (!apiKey && !hasKey) {
        if (!cancelled) {
          setError("Add your Unusual Whales API key in Settings.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setGexError(null);
      }

      try {
        const headers = apiHeaders(apiKey);
        const [analysisRes, gexRes] = await Promise.all([
          fetch(`/api/ticker/${currentSymbol}`, {
            headers,
            credentials: "same-origin",
          }),
          fetch(`/api/gex-study?ticker=${encodeURIComponent(currentSymbol)}&mode=weekly`, {
            headers,
            credentials: "same-origin",
          }),
        ]);

        const analysisData = await analysisRes.json();
        if (!analysisRes.ok) throw new Error(analysisData.error ?? "Failed to load analysis");

        let nextStudy: GexStudyResult | null = null;
        let nextGexError: string | null = null;
        if (gexRes.ok) {
          nextStudy = (await gexRes.json()) as GexStudyResult;
        } else {
          const gexData = await gexRes.json();
          nextGexError = gexData.error ?? "Failed to load gamma profile";
        }

        if (!cancelled) {
          setAnalysis(analysisData);
          setStudy(nextStudy);
          setGexError(nextGexError);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(cleanErrorMessage(err instanceof Error ? err.message : "Failed"));
          setAnalysis(null);
          setStudy(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load(symbol);
    return () => {
      cancelled = true;
    };
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
    <div className="w-full min-w-0 space-y-6 overflow-x-clip pb-8">
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to Scanner
        </Link>
        <WatchlistButton ticker={analysis.ticker} />
      </div>

      <ConfluenceContextWidget analysis={analysis} />

      <div className="grid w-full min-w-0 gap-6 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)] xl:items-start">
        <aside className="hidden min-w-0 space-y-4 xl:block">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Swing context
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-300">{analysis.action}</p>
            <div className="mt-4 space-y-2 text-xs text-zinc-500">
              <p>
                Coil <span className="font-medium text-zinc-300">{analysis.coilScore}</span>
              </p>
              <p>
                Dark pool{" "}
                <span className="font-medium text-zinc-300">
                  ${(analysis.darkPoolNotional / 1e6).toFixed(1)}M
                </span>
              </p>
              {analysis.gex?.gammaFlip != null && (
                <p>
                  Gamma flip{" "}
                  <span className="font-medium text-zinc-300">
                    ${analysis.gex.gammaFlip.toFixed(2)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {study ? (
            <TickerGexPanel study={study} />
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {gexError ?? "Gamma profile unavailable for this ticker."}
            </div>
          )}
        </div>
      </div>

      <TickerDetailView analysis={analysis} showScoreHeader={false} />
    </div>
  );
}
