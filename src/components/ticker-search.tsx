"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TickerSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Tickers are letters plus an optional class suffix (e.g. BRK.B).
    const symbol = value.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (!symbol) return;
    router.push(`/ticker/${symbol}`);
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search a ticker (e.g. AAPL)"
          aria-label="Search a stock ticker"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-zinc-500 focus:border-emerald-500"
        />
      </div>
      <button
        type="submit"
        disabled={!value.trim()}
        className="shrink-0 touch-manipulation rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"
      >
        Scan
      </button>
    </form>
  );
}
