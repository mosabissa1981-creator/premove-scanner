"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getHolding,
  markBought,
  markSold,
  useIsBought,
} from "@/lib/alerts/holdings";

export function HoldingsButtons({
  ticker,
  stockPrice,
  resistanceLevel,
}: {
  ticker: string;
  stockPrice?: number | null;
  resistanceLevel?: number | null;
}) {
  const bought = useIsBought(ticker);
  const holding = bought ? getHolding(ticker) : null;
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  function onBought() {
    const price = stockPrice;
    if (price == null || !Number.isFinite(price) || price <= 0) {
      setStatus("Need a live price to mark Bought.");
      return;
    }
    markBought({
      ticker,
      entryPrice: price,
      resistance: resistanceLevel ?? null,
      note: note.trim() || undefined,
    });
    setNote("");
    setStatus(`Bought ${ticker.toUpperCase()} @ $${price.toFixed(2)} — saved in Holdings.`);
  }

  function onSold() {
    markSold(ticker);
    setStatus(`Sold ${ticker.toUpperCase()} — removed from Holdings.`);
  }

  return (
    <div className="w-full min-w-0 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Position</p>
          <p className="text-xs text-zinc-500">
            {bought && holding
              ? `Open @ $${holding.entryPrice.toFixed(2)} · tracked for price alerts`
              : "Mark Bought to keep this ticker in Holdings"}
          </p>
        </div>
        <Link href="/holdings" className="text-xs text-emerald-400 underline">
          Open Holdings →
        </Link>
      </div>

      {!bought && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — e.g. calls, size"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onBought}
          disabled={bought}
          className={`flex-1 rounded-xl py-3 text-sm font-bold transition disabled:opacity-50 ${
            bought
              ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "bg-emerald-500 text-black hover:bg-emerald-400"
          }`}
        >
          {bought ? "✓ Bought" : "Bought"}
        </button>
        <button
          type="button"
          onClick={onSold}
          disabled={!bought}
          className="flex-1 rounded-xl border border-zinc-600 py-3 text-sm font-semibold text-zinc-200 transition enabled:hover:border-red-400/50 enabled:hover:text-red-300 disabled:opacity-40"
        >
          Sold
        </button>
      </div>

      {status && (
        <p className="text-xs text-emerald-300/90">{status}</p>
      )}
    </div>
  );
}
