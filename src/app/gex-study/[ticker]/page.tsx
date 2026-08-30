"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GexStrikeChart } from "@/components/gex-strike-chart";
import { TickerSearch } from "@/components/ticker-search";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import type { GexExpiryMode, GexStudyResult } from "@/lib/unusualwhales/types";

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function regimeBadge(regime: GexStudyResult["regime"]): { label: string; className: string } {
  if (regime === "positive") {
    return {
      label: "Above flip",
      className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (regime === "negative") {
    return {
      label: "Below flip",
      className: "border-red-500/40 bg-red-500/15 text-red-300",
    };
  }
  return {
    label: "Neutral",
    className: "border-zinc-700 bg-zinc-800 text-zinc-400",
  };
}

export default function GexStudyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const searchParams = useSearchParams();
  const { apiKey, hasKey } = useApiKey();
  const [ticker, setTicker] = useState<string | null>(null);
  const [study, setStudy] = useState<GexStudyResult | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [mode, setMode] = useState<GexExpiryMode>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setTicker(p.ticker.toUpperCase()));
  }, [params]);

  useEffect(() => {
    const expiryParam = searchParams.get("expiry");
    const modeParam = searchParams.get("mode") as GexExpiryMode | null;
    if (expiryParam) setSelectedExpiry(expiryParam);
    if (modeParam) setMode(modeParam);
  }, [searchParams]);

  const loadStudy = useCallback(
    async (symbol: string, expiry?: string, expiryMode?: GexExpiryMode) => {
      if (!apiKey && !hasKey) {
        setError("Add your Unusual Whales API key in Settings.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({ ticker: symbol });
        if (expiry) query.set("expiry", expiry);
        else if (expiryMode) query.set("mode", expiryMode);

        const res = await fetch(`/api/gex-study?${query.toString()}`, {
          headers: apiHeaders(apiKey),
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load GEX study");
        setStudy(data);
        setSelectedExpiry(data.expiry);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load GEX study");
        setStudy(null);
      } finally {
        setLoading(false);
      }
    },
    [apiKey, hasKey],
  );

  useEffect(() => {
    if (!ticker) return;
    const expiryParam = searchParams.get("expiry");
    const modeParam = (searchParams.get("mode") as GexExpiryMode | null) ?? "all";
    loadStudy(ticker, expiryParam ?? undefined, expiryParam ? undefined : modeParam);
  }, [ticker, searchParams, loadStudy]);

  const badge = study ? regimeBadge(study.regime) : null;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/gex-scan" className="text-sm text-emerald-400 hover:underline">
          ← GEX Scan
        </Link>
      </div>

      {!hasKey && (
        <Link
          href="/settings"
          className="block rounded-xl border border-red-500/40 bg-red-500/10 p-4"
        >
          <p className="font-semibold text-red-200">Add your Unusual Whales API key</p>
        </Link>
      )}

      <section className="space-y-4">
        <TickerSearch
          destination="gex-study"
          defaultValue={ticker ?? ""}
          placeholder="Search ticker for GEX walls (e.g. RKLB)"
          buttonLabel="Study"
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{ticker ?? "…"} GEX Walls</h1>
            <p className="mt-2 text-base leading-relaxed text-zinc-400 sm:text-sm">
              Gamma exposure by strike with put wall, gamma flip, and call wall — similar to
              OptionCharts-style GEX study.
            </p>
          </div>
          {badge && (
            <span
              className={`rounded-full border px-3 py-1.5 text-sm font-bold uppercase tracking-wide ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="expiry-select" className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Expiration
          </label>
          <select
            id="expiry-select"
            value={selectedExpiry}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedExpiry(value);
              if (ticker) loadStudy(ticker, value);
            }}
            disabled={loading || !study?.availableExpiries.length}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none disabled:opacity-50 sm:py-2 sm:text-sm"
          >
            <option value="all">All expiries</option>
            {(study?.availableExpiries ?? []).map((row) => (
              <option key={row.expiry} value={row.expiry}>
                {row.expiry} ({row.dte} DTE)
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="mode-select" className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Default expiry mode
          </label>
          <select
            id="mode-select"
            value={mode}
            onChange={(e) => {
              const value = e.target.value as GexExpiryMode;
              setMode(value);
              if (ticker) loadStudy(ticker, undefined, value);
            }}
            disabled={loading}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none disabled:opacity-50 sm:py-2 sm:text-sm"
          >
            <option value="daily">Daily (0DTE / nearest)</option>
            <option value="weekly">Weekly (next Friday)</option>
            <option value="monthly">Monthly (3rd Friday)</option>
            <option value="all">All expiries</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {study && !loading && (
        <>
          <GexStrikeChart
            strikes={study.strikes}
            stockPrice={study.stockPrice}
            putWall={study.putWall}
            gammaFlip={study.gammaFlip}
            callWall={study.callWall}
          />

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 sm:text-base">
              Gamma Exposure Stats
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
              <div>
                <div className="text-sm text-zinc-500">Net GEX ($ / 1% move)</div>
                <div
                  className={`mt-1 text-2xl font-bold tabular-nums sm:text-xl ${study.netGex >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {formatMoney(study.netGex)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Call GEX</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400 sm:text-xl">
                  {formatMoney(study.callGex)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Put GEX</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-red-400 sm:text-xl">
                  {formatMoney(study.putGex)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Spot</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-blue-300 sm:text-xl">
                  {formatPrice(study.stockPrice)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Put Wall</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-red-300 sm:text-xl">
                  {formatPrice(study.putWall)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Gamma Flip</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-100 sm:text-xl">
                  {formatPrice(study.gammaFlip)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Call Wall</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-300 sm:text-xl">
                  {formatPrice(study.callWall)}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Distance to flip</div>
                <div
                  className={`mt-1 text-2xl font-bold tabular-nums sm:text-xl ${study.regime === "positive" ? "text-emerald-400" : study.regime === "negative" ? "text-red-400" : "text-zinc-300"}`}
                >
                  {study.flipDistancePct != null
                    ? `${study.flipDistancePct >= 0 ? "+" : ""}${study.flipDistancePct.toFixed(1)}%`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">Gamma Magnet</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-amber-300 sm:text-xl">
                  {formatPrice(study.gammaMagnet)}
                </div>
              </div>
            </div>
          </section>

          <p className="text-sm text-zinc-500">
            Expiry {study.expiry} · Updated{" "}
            {new Date(study.scannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        </>
      )}
    </div>
  );
}
