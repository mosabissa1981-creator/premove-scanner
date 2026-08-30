"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import { filterAndSortGexRows, gexSides, tierClass } from "@/lib/gex-scan/gex-scan";
import type { GexExpiryMode, GexScanResult, GexScanRow } from "@/lib/unusualwhales/types";

const STORAGE_KEY = "premove_gex_tickers";
const DEFAULT_TICKERS = "NVDA AAPL TSLA AMD META SPY QQQ IWM MSFT AMZN";

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

function cls(value: number): string {
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function regimeLabel(regime: GexScanRow["regime"]): string {
  if (regime === "positive") return "+γ";
  if (regime === "negative") return "−γ";
  return "—";
}

function regimeClass(regime: GexScanRow["regime"]): string {
  if (regime === "positive") return "text-emerald-400";
  if (regime === "negative") return "text-red-400";
  return "text-zinc-500";
}

export default function GexScanPage() {
  const { apiKey, hasKey } = useApiKey();
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [expiry, setExpiry] = useState<GexExpiryMode>("daily");
  const [minRatio, setMinRatio] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GexScanResult | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved?.trim()) setTickers(saved);
    } catch {
      // ignore
    }
  }, []);

  const saveTickers = useCallback((value: string) => {
    setTickers(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }, []);

  const runScan = useCallback(async () => {
    if (!hasKey) {
      setError("Add your Unusual Whales API key in Settings first.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(5);

    try {
      const res = await fetch("/api/gex-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders(apiKey),
        },
        credentials: "same-origin",
        body: JSON.stringify({ tickers, expiry }),
      });
      setProgress(90);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "GEX scan failed");
      setResult(data);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GEX scan failed");
      setProgress(0);
    } finally {
      setLoading(false);
    }
  }, [apiKey, expiry, hasKey, tickers]);

  const visible = result ? filterAndSortGexRows(result.results, minRatio) : [];
  const okCount = result?.results.filter((row) => !row.error).length ?? 0;
  const hidden = okCount - visible.length;
  const callDom = visible.filter((row) => row.dominant === "CALL").length;
  const putDom = visible.filter((row) => row.dominant === "PUT").length;

  return (
    <div className="space-y-6 pb-8">
      {!hasKey && (
        <Link
          href="/settings"
          className="block rounded-xl border border-red-500/40 bg-red-500/10 p-4"
        >
          <p className="font-semibold text-red-200">Add your Unusual Whales API key</p>
          <p className="mt-1 text-sm text-red-300/80">
            GEX Scan uses the same API key as PreMove → Settings
          </p>
        </Link>
      )}

      <section>
        <h1 className="text-xl font-bold">GEX Scan</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Call : Put gamma exposure ratio scanner with gamma flip levels. Green = more call GEX,
          red = more put GEX. +γ = price above flip (positive gamma regime).
        </p>
      </section>

      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="space-y-2">
          <label htmlFor="tickers" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Tickers
          </label>
          <textarea
            id="tickers"
            value={tickers}
            onChange={(e) => saveTickers(e.target.value)}
            rows={4}
            spellCheck={false}
            autoCapitalize="characters"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          />
          <p className="text-xs text-zinc-500">Saved on this device. Max 100 tickers per scan.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="expiry" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Expiry
            </label>
            <select
              id="expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as GexExpiryMode)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
            >
              <option value="daily">Daily (0DTE / nearest)</option>
              <option value="weekly">Weekly (next Friday)</option>
              <option value="monthly">Monthly (3rd Friday)</option>
              <option value="all">All expiries (sum)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="minRatio" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Min ratio
            </label>
            <select
              id="minRatio"
              value={minRatio}
              onChange={(e) => setMinRatio(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
            >
              <option value={1}>Any (show all)</option>
              <option value={1.5}>1 : 1.5+</option>
              <option value={2}>1 : 2+</option>
              <option value={3}>1 : 3+</option>
              <option value={4}>1 : 4+</option>
              <option value={5}>1 : 5+</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={runScan}
          disabled={loading || !hasKey}
          className="w-full rounded-xl bg-emerald-500 py-4 text-base font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"
        >
          {loading ? "Scanning GEX…" : "Scan GEX"}
        </button>

        {loading && (
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <>
          <p className="text-sm text-zinc-400">
            Expiry {result.expiration} · {visible.length} shown
            {hidden > 0 ? ` (hid ${hidden})` : ""} · CALL {callDom} / PUT {putDom}
            {minRatio > 1 ? ` · min 1:${minRatio}` : ""}
            {" · "}
            {new Date(result.scannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>

          {visible.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-400">
              <span className="rounded-full border border-zinc-700 px-2 py-1">Call ≥ 1:3</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                Call heavy
              </span>
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300">
                Put heavy
              </span>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              {okCount === 0
                ? "Scan failed for all tickers. Check your API key and try again."
                : "No tickers at that Call:Put ratio."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full min-w-[860px] border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-3">Symbol</th>
                    <th className="px-3 py-3">Gamma flip</th>
                    <th className="px-3 py-3 text-right">Call GEX</th>
                    <th className="px-3 py-3 text-right">Put GEX</th>
                    <th className="hidden px-3 py-3 text-right sm:table-cell">Net GEX</th>
                    <th className="px-3 py-3">Call : Put</th>
                    <th className="hidden px-3 py-3 sm:table-cell">Dom</th>
                    <th className="hidden px-3 py-3 md:table-cell">Walls</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const { callHeavy } = gexSides(row);
                    const tier = tierClass(row);
                    const rowBg =
                      tier === "tier-call-hi"
                        ? "bg-emerald-500/20"
                        : tier === "tier-call-mid"
                          ? "bg-emerald-500/10"
                          : tier === "tier-call-lo"
                            ? "bg-emerald-500/5"
                            : tier === "tier-put-hi"
                              ? "bg-red-500/20"
                              : tier === "tier-put-mid"
                                ? "bg-red-500/10"
                                : tier === "tier-put-lo"
                                  ? "bg-red-500/5"
                                  : "";
                    return (
                      <tr key={row.ticker} className={`border-b border-zinc-800/80 ${rowBg}`}>
                        <td className="px-3 py-3 font-semibold">{row.ticker}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{formatPrice(row.gammaFlip)}</div>
                          <div className={`text-xs ${regimeClass(row.regime)}`}>
                            {regimeLabel(row.regime)}
                            {row.flipDistancePct != null
                              ? ` · ${row.flipDistancePct >= 0 ? "+" : ""}${row.flipDistancePct.toFixed(1)}%`
                              : ""}
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-right ${cls(row.callGex)}`}>
                          {formatMoney(row.callGex)}
                        </td>
                        <td className={`px-3 py-3 text-right ${cls(row.putGex)}`}>
                          {formatMoney(row.putGex)}
                        </td>
                        <td className={`hidden px-3 py-3 text-right sm:table-cell ${cls(row.netGex)}`}>
                          {formatMoney(row.netGex)}
                        </td>
                        <td className={`px-3 py-3 font-bold ${callHeavy ? "text-emerald-400" : "text-red-400"}`}>
                          {row.ratio}
                        </td>
                        <td className="hidden px-3 py-3 sm:table-cell">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              row.dominant === "CALL"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-red-500/15 text-red-300"
                            }`}
                          >
                            {row.dominant}
                          </span>
                        </td>
                        <td className="hidden px-3 py-3 text-zinc-400 md:table-cell">
                          {row.callWall ?? "—"} / {row.putWall ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              {result.errors.length} ticker{result.errors.length !== 1 ? "s" : ""} had errors:{" "}
              {result.errors.slice(0, 3).join(" · ")}
              {result.errors.length > 3 && ` (+${result.errors.length - 3} more)`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
