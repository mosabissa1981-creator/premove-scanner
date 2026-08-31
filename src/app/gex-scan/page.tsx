"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import { TickerSearch } from "@/components/ticker-search";
import { filterAndSortGexRows, filterByGammaFlip, gexSides, tierClass, type GammaFlipFilter } from "@/lib/gex-scan/gex-scan";
import { formatMoney, formatPrice, gexRegimeBadge, signedClass } from "@/lib/format";
import type { GexExpiryMode, GexScanResult, GexScanRow } from "@/lib/unusualwhales/types";

const STORAGE_KEY = "premove_gex_tickers";
const DEFAULT_TICKERS = "NVDA AAPL TSLA AMD META SPY QQQ IWM MSFT AMZN";

function flipBadge(row: GexScanRow) {
  return gexRegimeBadge(row.regime, { neutralLabel: "No flip" });
}

function rowBackground(row: GexScanRow): string {
  const tier = tierClass(row);
  if (row.regime === "positive") return "bg-emerald-500/5";
  if (row.regime === "negative") return "bg-red-500/5";
  if (tier === "tier-call-hi") return "bg-emerald-500/20";
  if (tier === "tier-call-mid") return "bg-emerald-500/10";
  if (tier === "tier-call-lo") return "bg-emerald-500/5";
  if (tier === "tier-put-hi") return "bg-red-500/20";
  if (tier === "tier-put-mid") return "bg-red-500/10";
  if (tier === "tier-put-lo") return "bg-red-500/5";
  return "";
}

function studyHref(ticker: string, expiry?: string): string {
  if (expiry && expiry !== "all" && /^\d{4}-\d{2}-\d{2}/.test(expiry)) {
    return `/gex-study/${ticker}?expiry=${encodeURIComponent(expiry.slice(0, 10))}`;
  }
  return `/gex-study/${ticker}`;
}

function GexScanResults({ rows, expiryMode }: { rows: GexScanRow[]; expiryMode: GexExpiryMode }) {
  return (
    <>
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => {
          const badge = flipBadge(row);
          const { callHeavy } = gexSides(row);
          return (
            <Link
              key={row.ticker}
              href={studyHref(row.ticker, row.expiry !== expiryMode ? row.expiry : undefined)}
              className={`block rounded-xl border border-zinc-800 p-3 transition hover:border-emerald-500/40 ${rowBackground(row)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-bold">{row.ticker}</div>
                  <span
                    className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Net GEX</div>
                  <div className={`text-sm font-semibold ${signedClass(row.netGex)}`}>{formatMoney(row.netGex)}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-zinc-500">Now</div>
                  <div className="font-medium text-zinc-200">{formatPrice(row.stockPrice)}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Flip</div>
                  <div className="font-medium text-zinc-200">{formatPrice(row.gammaFlip)}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Distance</div>
                  <div className={row.regime === "positive" ? "text-emerald-400" : row.regime === "negative" ? "text-red-400" : "text-zinc-400"}>
                    {row.flipDistancePct != null
                      ? `${row.flipDistancePct >= 0 ? "+" : ""}${row.flipDistancePct.toFixed(1)}%`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500">Call : Put</div>
                  <div className={`font-bold ${callHeavy ? "text-emerald-400" : "text-red-400"}`}>{row.ratio}</div>
                </div>
              </div>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-emerald-400/80">
                Study walls →
              </p>
            </Link>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 sm:block">
        <table className="w-full min-w-[720px] border-collapse text-sm tabular-nums">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-3">Symbol</th>
              <th className="px-3 py-3">Price vs flip</th>
              <th className="px-3 py-3 text-right">Net GEX</th>
              <th className="px-3 py-3 text-right">Call GEX</th>
              <th className="px-3 py-3 text-right">Put GEX</th>
              <th className="px-3 py-3">Call : Put</th>
              <th className="hidden px-3 py-3 md:table-cell">Walls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { callHeavy } = gexSides(row);
              const badge = flipBadge(row);
              return (
                <tr
                  key={row.ticker}
                  className={`border-b border-zinc-800/80 ${rowBackground(row)}`}
                >
                  <td className="px-3 py-3 font-semibold">
                    <Link
                      href={studyHref(row.ticker, row.expiry !== expiryMode ? row.expiry : undefined)}
                      className="text-emerald-400 hover:underline"
                    >
                      {row.ticker}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <div className="mt-1 text-xs text-zinc-400">Now {formatPrice(row.stockPrice)}</div>
                    <div className="text-xs text-zinc-500">
                      Flip {formatPrice(row.gammaFlip)}
                      {row.flipDistancePct != null
                        ? ` · ${row.flipDistancePct >= 0 ? "+" : ""}${row.flipDistancePct.toFixed(1)}%`
                        : ""}
                    </div>
                  </td>
                  <td className={`px-3 py-3 text-right font-semibold ${signedClass(row.netGex)}`}>
                    {formatMoney(row.netGex)}
                  </td>
                  <td className={`px-3 py-3 text-right ${signedClass(row.callGex)}`}>{formatMoney(row.callGex)}</td>
                  <td className={`px-3 py-3 text-right ${signedClass(row.putGex)}`}>{formatMoney(row.putGex)}</td>
                  <td className={`px-3 py-3 font-bold ${callHeavy ? "text-emerald-400" : "text-red-400"}`}>
                    {row.ratio}
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
    </>
  );
}

export default function GexScanPage() {
  const { apiKey, hasKey } = useApiKey();
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [expiry, setExpiry] = useState<GexExpiryMode>("daily");
  const [minRatio, setMinRatio] = useState(1);
  const [flipFilter, setFlipFilter] = useState<GammaFlipFilter>("all");
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

  const visible = result
    ? filterByGammaFlip(filterAndSortGexRows(result.results, minRatio), flipFilter)
    : [];
  const okCount = result?.results.filter((row) => !row.error).length ?? 0;
  const hidden = okCount - filterAndSortGexRows(result?.results ?? [], minRatio).length;
  const aboveFlip = visible.filter((row) => row.regime === "positive").length;
  const belowFlip = visible.filter((row) => row.regime === "negative").length;

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

      <section className="space-y-4">
        <TickerSearch
          destination="gex-study"
          placeholder="Jump to GEX walls (e.g. SMCI, RKLB)"
          buttonLabel="Study"
        />

        <div>
          <h1 className="text-xl font-bold">GEX Scan</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Compare <strong className="font-medium text-zinc-200">price vs gamma flip</strong> to see if a
            name is above or below the regime line. Green <strong className="text-emerald-400">Above flip</strong>{" "}
            = positive gamma. Red <strong className="text-red-400">Below flip</strong> = negative gamma.
          </p>
        </div>
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

        <div className="grid gap-3 sm:grid-cols-3">
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
          <div className="space-y-2">
            <label htmlFor="flipFilter" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Gamma flip
            </label>
            <select
              id="flipFilter"
              value={flipFilter}
              onChange={(e) => setFlipFilter(e.target.value as GammaFlipFilter)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
            >
              <option value="all">All regimes</option>
              <option value="above">Above flip only</option>
              <option value="below">Below flip only</option>
              <option value="near">Near flip (±2%)</option>
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
            {hidden > 0 ? ` (hid ${hidden} by ratio)` : ""} · Above {aboveFlip} / Below {belowFlip}
            {minRatio > 1 ? ` · min 1:${minRatio}` : ""}
            {flipFilter !== "all" ? ` · flip: ${flipFilter}` : ""}
            {" · "}
            {new Date(result.scannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>

          {visible.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-400">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                Above flip = price &gt; gamma flip
              </span>
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300">
                Below flip = price &lt; gamma flip
              </span>
              <span className="rounded-full border border-zinc-700 px-2 py-1">Call heavy</span>
              <span className="rounded-full border border-zinc-700 px-2 py-1">Put heavy</span>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              {okCount === 0
                ? "Scan failed for all tickers. Check your API key and try again."
                : "No tickers at that Call:Put ratio."}
            </p>
          ) : (
            <GexScanResults rows={visible} expiryMode={result.expiryMode} />
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
