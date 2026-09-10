"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CheapBand } from "@/lib/cheap-movers/universe";
import type { CheapScanResult } from "@/lib/cheap-movers/scan";
import type { CheapSetup } from "@/lib/cheap-movers/score";
import {
  addToCoilWatchlist,
  clearCoilWatchlist,
  removeFromCoilWatchlist,
  setupToWatchItem,
  toggleCoilWatchlist,
  useCoilWatchlist,
  useIsOnCoilWatchlist,
  type CoilWatchItem,
} from "@/lib/coil-watchlist";

const CACHE_KEY = "coil_last_scan_v1";

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
  if (price < 0.1) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(2)}`;
}

function bandLabel(band: CheapSetup["band"] | undefined): string {
  if (band === "under01") return "Under $0.10";
  if (band === "under05") return "Under $0.50";
  if (band === "under1") return "Under $1";
  if (band === "oneToFive") return "$1–$5";
  return "Saved";
}

type CoilView = "scan" | "watchlist";

export default function CoilMoversPage() {
  const [view, setView] = useState<CoilView>("scan");
  const [band, setBand] = useState<CheapBand>("all");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheapScanResult | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchlist = useCoilWatchlist();

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
      const res = await fetch(`/api/movers/scan?band=${band}&limit=40`);
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
    <>
      <section>
        <p className="coil-eyebrow">Free · No API key · No options</p>
        <h1 className="coil-title">Stocks under $5, before they move</h1>
        <p className="coil-lede">
          Coil finds quiet bases with rising volume — under $0.10, $0.50, $1, and $1–$5 — using
          free Yahoo price &amp; volume. Save tickers to your local watchlist.
        </p>
      </section>

      <div className="coil-views" role="tablist" aria-label="Coil view">
        <button
          type="button"
          role="tab"
          className="coil-view"
          aria-selected={view === "scan"}
          onClick={() => setView("scan")}
        >
          Scanner
        </button>
        <button
          type="button"
          role="tab"
          className="coil-view"
          aria-selected={view === "watchlist"}
          onClick={() => setView("watchlist")}
        >
          Watchlist{watchlist.length > 0 ? ` (${watchlist.length})` : ""}
        </button>
      </div>

      {view === "watchlist" ? (
        <WatchlistView items={watchlist} />
      ) : (
        <>
          <div className="coil-bands" role="tablist" aria-label="Price band">
            <button
              type="button"
              role="tab"
              className="coil-band"
              aria-selected={band === "all"}
              onClick={() => setBand("all")}
            >
              All ≤$5
            </button>
            <button
              type="button"
              role="tab"
              className="coil-band"
              aria-selected={band === "under01"}
              onClick={() => setBand("under01")}
            >
              Under $0.10
            </button>
            <button
              type="button"
              role="tab"
              className="coil-band"
              aria-selected={band === "under05"}
              onClick={() => setBand("under05")}
            >
              Under $0.50
            </button>
            <button
              type="button"
              role="tab"
              className="coil-band"
              aria-selected={band === "under1"}
              onClick={() => setBand("under1")}
            >
              Under $1
            </button>
            <button
              type="button"
              role="tab"
              className="coil-band"
              aria-selected={band === "oneToFive"}
              onClick={() => setBand("oneToFive")}
            >
              $1–$5
            </button>
          </div>

          <button type="button" className="coil-cta" onClick={runScan} disabled={loading}>
            {loading
              ? "Scanning Yahoo price & volume…"
              : result
                ? "Refresh setups"
                : "Find stocks ready to move"}
          </button>

          {error && <div className="coil-error">{error}</div>}

          {loading && (
            <div className="coil-loading">
              <div className="coil-spinner" />
              Checking ~100 tickers… usually 20–40 seconds
            </div>
          )}

          {result && (
            <>
              <p className="coil-meta">
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

              <div className="coil-stats">
                <div className="coil-stat">
                  <div className="coil-stat-value accent">{ready.length}</div>
                  <div className="coil-stat-label">Ready</div>
                </div>
                <div className="coil-stat">
                  <div className="coil-stat-value">{settingUp.length}</div>
                  <div className="coil-stat-label">Setting up</div>
                </div>
                <div className="coil-stat">
                  <div className="coil-stat-value">{early.length}</div>
                  <div className="coil-stat-label">Early</div>
                </div>
              </div>

              {ready.length > 0 && (
                <SetupSection
                  title="Ready to move"
                  subtitle="Lighter filter — 2+ signals · watch for breakout entry"
                  items={ready}
                />
              )}
              {settingUp.length > 0 && (
                <SetupSection
                  title="Setting up"
                  subtitle="Heat building — add to watchlist, wait for confirmation"
                  items={settingUp}
                />
              )}
              {early.length > 0 && (
                <SetupSection title="Early" subtitle="Too soon — monitor daily" items={early} />
              )}

              {result.results.length === 0 && (
                <p className="coil-meta">
                  No strong setups in this band right now. Try another band or refresh later.
                </p>
              )}
            </>
          )}
        </>
      )}

      <section className="coil-help">
        <h3>How Coil works</h3>
        <ul>
          <li>Screens a curated list, keeps only live prices ≤ $5</li>
          <li>Bands: Under $0.10 · Under $0.50 · Under $1 · $1–$5 · All ≤$5</li>
          <li>Tap ★ Save on any card — stored on this device only</li>
          <li>Watchlist is separate from PreMove and needs no API key</li>
          <li>Cheap stocks are risky — wide spreads, gaps, easy to get stuck</li>
        </ul>
      </section>
    </>
  );
}

function WatchlistView({ items }: { items: CoilWatchItem[] }) {
  const [draft, setDraft] = useState("");
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [items],
  );

  function addManual() {
    const ticker = draft.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (!ticker) return;
    addToCoilWatchlist(ticker);
    setDraft("");
  }

  return (
    <section className="coil-section" style={{ marginTop: "1rem" }}>
      <h2>Your watchlist</h2>
      <p>Saved on this phone/browser only — no account, no API key.</p>

      <form
        className="coil-add-row"
        onSubmit={(e) => {
          e.preventDefault();
          addManual();
        }}
      >
        <input
          className="coil-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder="Add ticker (e.g. CLOV)"
          aria-label="Ticker to save"
          maxLength={12}
        />
        <button type="submit" className="coil-add-btn">
          Save
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="coil-meta">No saved tickers yet. Scan and tap ★ Save, or type a ticker above.</p>
      ) : (
        <>
          <div className="coil-watch-actions">
            <button type="button" className="coil-text-btn" onClick={() => clearCoilWatchlist()}>
              Clear all
            </button>
          </div>
          {sorted.map((item) => (
            <WatchCard key={item.ticker} item={item} />
          ))}
        </>
      )}
    </section>
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
    <section className="coil-section">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {items.map((item) => (
        <CoilCard key={item.ticker} setup={item} />
      ))}
    </section>
  );
}

function CoilCard({ setup }: { setup: CheapSetup }) {
  const saved = useIsOnCoilWatchlist(setup.ticker);
  const badgeClass =
    setup.tier === "ready" ? "ready" : setup.tier === "setting-up" ? "setting-up" : "early";

  return (
    <article className="coil-card">
      <div className="coil-card-top">
        <div>
          <div className="coil-badges" style={{ marginTop: 0 }}>
            <span className="coil-ticker">{setup.ticker}</span>
            <span className="coil-price">{formatPrice(setup.stockPrice)}</span>
          </div>
          <div className="coil-badges">
            <span className={`coil-badge ${badgeClass}`}>{setup.tierLabel}</span>
            <span className="coil-badge">{bandLabel(setup.band)}</span>
          </div>
          {setup.companyName && (
            <p className="coil-action" style={{ marginTop: "0.35rem" }}>
              {setup.companyName}
            </p>
          )}
          <p className="coil-action">{setup.action}</p>
        </div>
        <div className="coil-score">
          <div className="coil-score-pct">{setup.scorePct}%</div>
          <div className="coil-score-sub">
            {setup.score}/{setup.maxScore}
          </div>
          <button
            type="button"
            className={`coil-save ${saved ? "on" : ""}`}
            aria-pressed={saved}
            onClick={() => toggleCoilWatchlist(setupToWatchItem(setup))}
          >
            {saved ? "★ Saved" : "☆ Save"}
          </button>
        </div>
      </div>

      <div className="coil-chips">
        <span className="coil-chip">Coil {setup.coilScore}</span>
        {setup.relativeVolume != null && (
          <span className="coil-chip">Vol {setup.relativeVolume.toFixed(1)}×</span>
        )}
        <span className="coil-chip">
          {setup.change1dPct >= 0 ? "+" : ""}
          {setup.change1dPct.toFixed(1)}% 1d
        </span>
        {setup.resistanceLevel != null && (
          <span className="coil-chip">R {formatPrice(setup.resistanceLevel)}</span>
        )}
      </div>

      <div className="coil-signals">
        {setup.signals
          .filter((s) => s.triggered)
          .map((s) => (
            <div key={s.id}>
              <strong>{s.label}</strong> — {s.description}
            </div>
          ))}
      </div>
    </article>
  );
}

function WatchCard({ item }: { item: CoilWatchItem }) {
  const badgeClass =
    item.tier === "ready" ? "ready" : item.tier === "setting-up" ? "setting-up" : "early";

  return (
    <article className="coil-card">
      <div className="coil-card-top">
        <div>
          <div className="coil-badges" style={{ marginTop: 0 }}>
            <span className="coil-ticker">{item.ticker}</span>
            {item.stockPrice != null && (
              <span className="coil-price">{formatPrice(item.stockPrice)}</span>
            )}
          </div>
          <div className="coil-badges">
            {item.tierLabel && (
              <span className={`coil-badge ${badgeClass}`}>{item.tierLabel}</span>
            )}
            <span className="coil-badge">{bandLabel(item.band)}</span>
          </div>
          {item.companyName && (
            <p className="coil-action" style={{ marginTop: "0.35rem" }}>
              {item.companyName}
            </p>
          )}
          {item.action && <p className="coil-action">{item.action}</p>}
          <p className="coil-action">
            Saved{" "}
            {new Date(item.savedAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="coil-score">
          {item.scorePct != null && <div className="coil-score-pct">{item.scorePct}%</div>}
          <button
            type="button"
            className="coil-save on"
            onClick={() => removeFromCoilWatchlist(item.ticker)}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
