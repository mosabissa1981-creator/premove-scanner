"use client";

import Link from "next/link";
import { useWatchlist } from "@/lib/watchlist";

export default function WatchlistPage() {
  const tickers = useWatchlist();

  if (tickers.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
        <h1 className="text-xl font-bold">Watchlist</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Run a scan and add tickers from the detail page to build your watchlist.
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Watchlist</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tickers.map((ticker) => (
          <Link
            key={ticker}
            href={`/ticker/${ticker}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-600"
          >
            <span className="text-lg font-bold">{ticker}</span>
            <p className="mt-1 text-xs text-zinc-500">Click for full analysis</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
