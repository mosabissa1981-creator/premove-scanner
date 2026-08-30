"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeTicker } from "@/lib/gex-scan/gex-scan";

type TickerSearchDestination = "ticker" | "gex-study";

interface TickerSearchProps {
  destination?: TickerSearchDestination;
  placeholder?: string;
  buttonLabel?: string;
  defaultValue?: string;
}

function destinationHref(destination: TickerSearchDestination, symbol: string): string {
  if (destination === "gex-study") return `/gex-study/${symbol}`;
  return `/ticker/${symbol}`;
}

export function TickerSearch({
  destination = "ticker",
  placeholder = "Search a ticker (e.g. AAPL)",
  buttonLabel = destination === "gex-study" ? "Study" : "Scan",
  defaultValue = "",
}: TickerSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = normalizeTicker(value);
    if (!symbol) return;
    router.push(destinationHref(destination, symbol));
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
          type="search"
          enterKeyHint="search"
          inputMode="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label="Search a stock ticker"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-3 text-base uppercase outline-none placeholder:normal-case placeholder:text-zinc-500 focus:border-emerald-500 sm:text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={!value.trim()}
        className="shrink-0 touch-manipulation rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"
      >
        {buttonLabel}
      </button>
    </form>
  );
}
