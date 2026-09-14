"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import { markSold, useHoldings } from "@/lib/alerts/holdings";
import { processScanAlerts } from "@/lib/alerts/client-notify";
import type { ScanResult, TickerAnalysis } from "@/lib/unusualwhales/types";
import type { TrackedEntry } from "@/lib/alerts/types";

async function fetchHoldingScores(
  apiKey: string,
  tickers: string[],
): Promise<{ results: TickerAnalysis[]; errors: string[] }> {
  const res = await fetch("/api/watchlist", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...apiHeaders(apiKey),
    },
    body: JSON.stringify({ tickers }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Refresh failed");
  return { results: data.results ?? [], errors: data.errors ?? [] };
}

function pnlPct(entry: TrackedEntry, live?: number | null): number | null {
  if (live == null || !Number.isFinite(live) || entry.entryPrice <= 0) return null;
  return ((live - entry.entryPrice) / entry.entryPrice) * 100;
}

export default function HoldingsPage() {
  const { apiKey, hasKey } = useApiKey();
  const router = useRouter();
  const holdings = useHoldings();
  const tickers = useMemo(
    () => holdings.map((h) => h.ticker.toUpperCase()),
    [holdings],
  );
  const [results, setResults] = useState<TickerAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertNote, setAlertNote] = useState<string | null>(null);

  const runRefresh = useCallback(async () => {
    if (!hasKey || tickers.length === 0) return;
    setLoading(true);
    setError(null);
    setAlertNote(null);
    try {
      const { results: scored, errors } = await fetchHoldingScores(apiKey, tickers);
      setResults(scored);
      setError(errors.length ? `Some tickers failed: ${errors.join(", ")}` : null);

      // Push price-change + entry-timing alerts to iPhone / Telegram.
      try {
        const scan: ScanResult = {
          scannedAt: new Date().toISOString(),
          candidatesScreened: scored.length,
          results: scored,
          errors,
          strategy: "holdings-refresh",
        };
        const alertResult = await processScanAlerts(scan);
        if (alertResult.sent > 0) {
          setAlertNote(
            `Sent ${alertResult.sent} alert${alertResult.sent === 1 ? "" : "s"} (price / entry timing).`,
          );
        } else if (alertResult.errors.length > 0) {
          setAlertNote(`Alert delivery issue: ${alertResult.errors[0]}`);
        }
      } catch {
        // Alerts are best-effort.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }, [apiKey, hasKey, tickers]);

  useEffect(() => {
    if (tickers.length === 0 || !hasKey) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { results: scored, errors } = await fetchHoldingScores(apiKey, tickers);
        if (cancelled) return;
        setResults(scored);
        setError(errors.length ? `Some tickers failed: ${errors.join(", ")}` : null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Refresh failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiKey, hasKey, tickers]);

  const byTicker = useMemo(() => {
    const map = new Map<string, TickerAnalysis>();
    for (const row of results) map.set(row.ticker.toUpperCase(), row);
    return map;
  }, [results]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
        <h1 className="text-xl font-bold">Holdings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Tap a ticker → mark <strong className="text-zinc-300">Bought</strong> to keep it here.
          Refresh to push price moves and entry-timing alerts to your iPhone.
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
          <h1 className="text-xl font-bold">Holdings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {holdings.length} open position{holdings.length !== 1 ? "s" : ""} — Bought tickers
            you are tracking
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runRefresh()}
          disabled={loading || !hasKey}
          className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-40"
        >
          {loading ? "Refreshing…" : "Refresh + alert"}
        </button>
      </div>

      {!hasKey && (
        <Link
          href="/settings"
          className="block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          Add API key to refresh live prices →
        </Link>
      )}

      {alertNote && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {alertNote}{" "}
          <Link href="/settings" className="underline">
            Manage alerts
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {holdings.map((entry) => {
          const live = byTicker.get(entry.ticker.toUpperCase());
          const pct = pnlPct(entry, live?.stockPrice);
          const aboveR =
            live?.stockPrice != null &&
            live.resistanceLevel != null &&
            live.stockPrice > live.resistanceLevel;

          return (
            <div
              key={entry.ticker}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/ticker/${entry.ticker}`)}
                  className="text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{entry.ticker}</span>
                    {live?.tier === "ready" && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">
                        Ready
                      </span>
                    )}
                    {aboveR && (
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
                        Good entry
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Bought @ ${entry.entryPrice.toFixed(2)}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </button>

                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">
                    {live?.stockPrice != null
                      ? `$${live.stockPrice.toFixed(2)}`
                      : "—"}
                  </p>
                  {pct != null && (
                    <p
                      className={`text-sm font-medium tabular-nums ${
                        pct >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {pct >= 0 ? "+" : ""}
                      {pct.toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/ticker/${entry.ticker}`)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                >
                  Open ticker
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markSold(entry.ticker);
                    setResults((prev) =>
                      prev.filter((r) => r.ticker.toUpperCase() !== entry.ticker.toUpperCase()),
                    );
                  }}
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300"
                >
                  Sold
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-zinc-500">
        Enable Web Push in{" "}
        <Link href="/settings" className="text-emerald-400 underline">
          Settings → Alerts
        </Link>{" "}
        so your iPhone gets price-change and “good time for entry” notifications.
      </p>
    </div>
  );
}
