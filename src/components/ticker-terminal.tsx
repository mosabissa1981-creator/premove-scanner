"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GexStrikeChart } from "@/components/gex-strike-chart";
import { IvSmileChart } from "@/components/iv-smile-chart";
import { OdteExpiryToggle, type OdteFilterMode } from "@/components/odte-expiry-toggle";
import { StructuralMemoryChart } from "@/components/structural-memory-chart";
import { apiHeaders, useApiKey } from "@/lib/api-key-context";
import { formatMoney, formatPrice } from "@/lib/format";
import type { HistoricalGexRow } from "@/lib/db/historical-gex";
import type { GexStudyResult } from "@/lib/unusualwhales/types";
import { resolvePlotStrikeDomain } from "@/utils/chart-domain";
import { strikeBounds } from "@/lib/gex-study/gex-chart-viewport";

type TerminalTab = "gex" | "volatility";

export function TickerTerminal({
  ticker,
  initialStudy,
}: {
  ticker: string;
  initialStudy: GexStudyResult;
}) {
  const { apiKey } = useApiKey();
  const [study, setStudy] = useState(initialStudy);
  const [odteMode, setOdteMode] = useState<OdteFilterMode>(
    initialStudy.odteOnly ? "odte" : "all",
  );
  const [tab, setTab] = useState<TerminalTab>("gex");
  const [memoryOpen, setMemoryOpen] = useState(true);
  const [memoryRows, setMemoryRows] = useState<HistoricalGexRow[]>([]);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);

  const strikeDomain = useMemo(() => {
    const bounds = strikeBounds(study.strikes);
    const plotted = study.strikes.map((point) => point.strike);
    const viewport = bounds;
    return resolvePlotStrikeDomain(viewport, bounds, plotted);
  }, [study.strikes]);

  const loadStudy = useCallback(
    async (mode: OdteFilterMode) => {
      setLoadingStudy(true);
      setStudyError(null);
      try {
        const query = new URLSearchParams({
          ticker,
          mode: "weekly",
          odteOnly: mode === "odte" ? "true" : "false",
        });
        const res = await fetch(`/api/gex-study?${query.toString()}`, {
          headers: apiHeaders(apiKey),
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to refresh GEX study");
        setStudy(data);
      } catch (err) {
        setStudyError(err instanceof Error ? err.message : "Failed to refresh GEX study");
      } finally {
        setLoadingStudy(false);
      }
    },
    [apiKey, ticker],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadMemory() {
      try {
        const res = await fetch(`/api/historical-gex/${encodeURIComponent(ticker)}?days=15`, {
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!cancelled) setMemoryRows(data.rows ?? []);
      } catch {
        if (!cancelled) setMemoryRows([]);
      }
    }
    loadMemory();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const handleOdteChange = (mode: OdteFilterMode) => {
    setOdteMode(mode);
    void loadStudy(mode);
  };

  return (
    <section className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300">Predictive Gamma Terminal</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Live structural levels, ODTE slice, IV skew, and 15-day memory
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          Expiry {study.expiry} · {study.profileSource} profile
          {study.odteOnly ? " · 0DTE" : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-900/80 p-0.5">
          <TabButton active={tab === "gex"} onClick={() => setTab("gex")}>
            GEX Profile
          </TabButton>
          <TabButton active={tab === "volatility"} onClick={() => setTab("volatility")}>
            Volatility Structure
          </TabButton>
        </div>
        <OdteExpiryToggle value={odteMode} onChange={handleOdteChange} disabled={loadingStudy} />
      </div>

      {studyError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {studyError}
        </p>
      )}

      {tab === "gex" ? (
        <GexStrikeChart
          strikes={study.strikes}
          stockPrice={study.stockPrice}
          putWall={study.putWall}
          gammaFlip={study.gammaFlip}
          callWall={study.callWall}
        />
      ) : (
        <IvSmileChart
          points={study.ivSmile ?? []}
          stockPrice={study.stockPrice}
          strikeMin={strikeDomain.domainMin}
          strikeMax={strikeDomain.domainMax}
        />
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setMemoryOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-zinc-200">📈 Structural Memory Tracker</span>
          <span className="text-xs text-zinc-500">{memoryOpen ? "Hide" : "Show"}</span>
        </button>
        {memoryOpen && (
          <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
            <StructuralMemoryChart rows={memoryRows} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Gamma Exposure Stats
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label="Net GEX ($ / 1% move)"
            value={formatMoney(study.netGex)}
            accent={study.netGex >= 0 ? "emerald" : "red"}
          />
          <Stat label="Call GEX" value={formatMoney(study.callGex)} accent="emerald" />
          <Stat label="Put GEX" value={formatMoney(study.putGex)} accent="red" />
          <Stat label="Put Wall" value={formatPrice(study.putWall)} accent="red" />
          <Stat label="Gamma Flip" value={formatPrice(study.gammaFlip)} />
          <Stat label="Call Wall" value={formatPrice(study.callWall)} accent="emerald" />
        </div>
      </div>
    </section>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
        active ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red";
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "red"
        ? "text-red-400"
        : "text-zinc-100";

  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums sm:text-xl ${valueClass}`}>{value}</div>
    </div>
  );
}
