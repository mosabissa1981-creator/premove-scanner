"use client";

import { useCallback, useEffect, useState } from "react";
import type { CheapBand } from "@/lib/cheap-movers/universe";
import type { CheapScanResult } from "@/lib/cheap-movers/scan";
import type { CheapSetup } from "@/lib/cheap-movers/score";

const CACHE_KEY = "premove_last_cheap_scan_v1";

function loadCache(): CheapScanResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheapScanResult;
    if (!parsed?.scannedAt || !Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(scan: CheapScanResult) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(scan));
  } catch {
    // ignore
  }
}

function formatPrice(price: number): string {
  if (price < 1) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(2)}`;
}

const tierStyles: Record<CheapSetup["tier"], string> = {
  ready: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  "setting-up": "border-sky-500/40 bg-sky-500/15 text-sky-300",
  early: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  watch: "border-zinc-600 bg-zinc-800 text-zinc-400",
};

export default function CheapMoversPage() {
  const [band, setBand] = useState<CheapBand>("all");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheapScanResult | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = loadCache();
    if (cached) {
      setResult(cached);
      setFromCache(true);
      setBand(cached.band);
    }
  }, []);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cheap-scan?band=${band}&limit=30`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
      setFromCache(false);
      saveCache(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [band]);

  const ready = result?.results.filter((r) => r.tier === "ready") ?? [];
  const settingUp = result?.results.filter((r) => r.tier === "setting-up") ?? [];
  const early = result?.results.filter((r) => r.tier === "early") ?? [];

  return (
    <div className="space-y-6 pb-8">
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
          Free · No API key · Stocks only
        </p>
        <h1 className="mt-1 text-xl font-bold">Stocks Under $5 Ready to Move</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Coiling bases with rising volume — under $1 and $1–$5. Free Yahoo price &amp; volume
          only. No options. No paid key.
        </p>
      </section>

      <div
        className="grid grid-cols-3 gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1"
        role="tablist"
        aria-label="Price band"
      >
        <BandTab active={band === "all"} label="All ≤$5" onClick={() => setBand("all")} />
        <BandTab active={band === "under1"} label="Under $1" onClick={() => setBand("under1")} />
        <BandTab
          active={band === "oneToFive"}
          label="$1–$5"
          onClick={() => setBand("oneToFive")}
        />
      </div>

      <button
        type="button"
        onClick={runScan}
        disabled={loading}
        className="w-full rounded-xl bg-emerald-500 py-4 text-base font-bold text-black transition hover:bg-emerald-400 disabled:opacity-40"
      >
        {loading
          ? "Scanning free price & volume…"
          : result
            ? "Refresh Under-$5 Setups"
            : "Find Stocks Ready to Move"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          Checking ~100 tickers on Yahoo… usually 20–40 seconds
        </div>
      )}

      {result && (
        <>
          <p className="text-center text-xs text-zinc-500">
            {fromCache ? "Saved last scan · " : ""}
            {result.pricedInBand} under $5 of {result.candidatesScreened} screened
            {result.scannedAt && (
              <>
                {" "}
                ·{" "}
                {new Date(result.scannedAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>

          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Ready" value={ready.length} accent />
            <MiniStat label="Setting up" value={settingUp.length} />
            <MiniStat label="Early" value={early.length} />
          </div>

          {ready.length > 0 && (
            <SetupSection
              title="Ready to Move"
              subtitle="Coil + volume + near breakout"
              items={ready}
            />
          )}
          {settingUp.length > 0 && (
            <SetupSection
              title="Setting Up"
              subtitle="Heat building — wait for confirmation"
              items={settingUp}
            />
          )}
          {early.length > 0 && (
            <SetupSection title="Early" subtitle="Too soon — monitor daily" items={early} />
          )}

          {result.results.length === 0 && (
            <p className="text-center text-sm text-zinc-500">
              No strong under-$5 setups in this band right now. Try another band or refresh later.
            </p>
          )}
        </>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
        <p className="font-medium text-zinc-400">How this works</p>
        <ul className="mt-2 space-y-1.5">
          <li>Price ≤ $5 from free Yahoo charts (Under $1 or $1–$5)</li>
          <li>Looks for coiling price, quiet base, volume heat, near breakout</li>
          <li>No options flow, no paid API key</li>
          <li>Cheap stocks are risky — wide spreads, gaps, easy to get stuck</li>
        </ul>
      </section>
    </div>
  );
}

function BandTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-2 py-2.5 text-center text-sm font-bold transition ${
        active
          ? "bg-emerald-500 text-black shadow-sm"
          : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-3">
      <div className={`text-2xl font-bold ${accent ? "text-emerald-400" : "text-zinc-200"}`}>
        {value}
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function SetupSection({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: CheapSetup[];
}) {
  return (
    <section>
      <h2 className="font-semibold text-zinc-200">{title}</h2>
      <p className="text-xs text-zinc-500">{subtitle}</p>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <CheapCard key={item.ticker} setup={item} />
        ))}
      </div>
    </section>
  );
}

function CheapCard({ setup }: { setup: CheapSetup }) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-zinc-100">{setup.ticker}</span>
            <span className="text-sm font-semibold tabular-nums text-zinc-300">
              {formatPrice(setup.stockPrice)}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tierStyles[setup.tier]}`}
            >
              {setup.tierLabel}
            </span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
              {setup.band === "under1" ? "Under $1" : "$1–$5"}
            </span>
          </div>
          {setup.companyName && (
            <p className="mt-0.5 truncate text-sm text-zinc-500">{setup.companyName}</p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">{setup.action}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold tabular-nums text-emerald-400">{setup.scorePct}%</div>
          <div className="text-[10px] text-zinc-500">
            {setup.score}/{setup.maxScore}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
          Coil {setup.coilScore}
        </span>
        {setup.relativeVolume != null && (
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
            Vol {setup.relativeVolume.toFixed(1)}×
          </span>
        )}
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
          {setup.change1dPct >= 0 ? "+" : ""}
          {setup.change1dPct.toFixed(1)}% 1d
        </span>
        {setup.resistanceLevel != null && (
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
            R {formatPrice(setup.resistanceLevel)}
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-1">
        {setup.signals
          .filter((s) => s.triggered)
          .map((s) => (
            <li key={s.id} className="text-[11px] text-zinc-400">
              <span className="font-medium text-zinc-300">{s.label}</span> — {s.description}
            </li>
          ))}
      </ul>
    </article>
  );
}
