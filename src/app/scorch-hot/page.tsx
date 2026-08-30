"use client";

import { useCallback, useEffect, useState } from "react";
import type { IdeaNote, SectorsPayload, SleeveRow } from "@/lib/scorch-hot/sectors";

const REFRESH_OPTIONS = [
  { label: "Off", ms: 0 },
  { label: "1 min", ms: 60_000 },
  { label: "5 min", ms: 300_000 },
  { label: "15 min", ms: 900_000 },
  { label: "30 min", ms: 1_800_000 },
];

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function heatWidth(heat: number): number {
  return Math.min(100, Math.max(8, Math.abs(heat) * 8));
}

function SleeveCard({ row }: { row: SleeveRow }) {
  return (
    <article className={`sleeve-card tone-${row.tone}`}>
      <div className="sleeve-head">
        <div>
          <div className="sleeve-rank">#{row.rank}</div>
          <h3>{row.name}</h3>
          <p className="sleeve-meta">
            {row.etf} · {row.kind === "theme" ? "Theme" : "Sector"} · {row.label}
          </p>
        </div>
        <div className="sleeve-change">{fmtPct(row.change1d)}</div>
      </div>
      <div className="heatbar-wrap" aria-hidden>
        <div className="heatbar" style={{ width: `${heatWidth(row.heat)}%` }} />
      </div>
      {row.topMovers.length > 0 && (
        <div className="sleeve-movers">
          {row.topMovers.map((stock) => (
            <span key={stock.ticker} className={`sleeve-mover ${stock.change1d >= 0 ? "up" : "down"}`}>
              <strong>{stock.ticker}</strong> {fmtPct(stock.change1d)}
            </span>
          ))}
        </div>
      )}
      <div className="sleeve-tickers" aria-label={`${row.name} holdings`}>
        {row.names.map((ticker) => (
          <span key={ticker} className="sleeve-ticker">
            {ticker}
          </span>
        ))}
      </div>
      <div className="sleeve-foot">
        <span>Heat {row.heat.toFixed(2)}</span>
        <span>1M {fmtPct(row.change1m)}</span>
      </div>
    </article>
  );
}

function NoteCard({ note }: { note: IdeaNote }) {
  return (
    <article className="note-card">
      <p className="note-kind">{note.kind}</p>
      <h3>{note.headline}</h3>
      <ul>
        {note.bullets.map((b) => (
          <li key={b.text}>{b.text}</li>
        ))}
      </ul>
      {note.summary && <p className="note-summary">{note.summary}</p>}
    </article>
  );
}

export default function ScorchHotPage() {
  const [data, setData] = useState<SectorsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshMs, setRefreshMs] = useState(300_000);
  const [notify, setNotify] = useState(false);
  const [lastLeader, setLastLeader] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(
    async (bust = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/scorch-hot${bust ? `?t=${Date.now()}` : ""}`);
        const json = (await res.json()) as SectorsPayload & { error?: string; detail?: string };
        if (!res.ok) throw new Error(json.detail || json.error || "Failed to load");
        setData(json);

        const leader = json.dayBoard?.[0]?.name;
        if (leader && lastLeader && leader !== lastLeader && notify) {
          setToast(`Board leader changed: ${lastLeader} → ${leader}`);
        }
        if (leader) setLastLeader(leader);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [lastLeader, notify],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = window.setInterval(() => void load(true), refreshMs);
    return () => window.clearInterval(id);
  }, [load, refreshMs]);

  const refreshLabel = REFRESH_OPTIONS.find((o) => o.ms === refreshMs)?.label ?? "Off";

  return (
    <div className="scorch-hot-root">
      <div className="page">
        <div className="atmosphere" aria-hidden>
          <div className="glow glow-a" />
          <div className="glow glow-b" />
          <div className="grid-fade" />
        </div>

        <header className="topbar">
          <div className="brand">Scorch Hot</div>
          <button className="ghost" type="button" onClick={() => void load(true)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh heat"}
          </button>
        </header>

        {toast && (
          <div className="shift-toast" onClick={() => setToast(null)}>
            {toast}
          </div>
        )}

        <div className="scorch-main">
          <section className="hero">
            <p className="eyebrow">Sector heat scanner</p>
            <h1>
              Find the <em>hot sectors</em>
            </h1>
            <p className="lede">
              Sector heat, theme baskets, and liquidity notes — Yahoo Finance data, no API key required.
            </p>
          </section>

          {error && <p className="error-box">{error}</p>}

          {data && (
            <>
              <section className="highlights">
                <p className="headline">{data.headline}</p>
                <p className="subhead">{data.stockHeadline}</p>
                <p className="analysis">{data.analysis}</p>
                <ul className="chip-list">
                  {data.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>

              <section className="panel">
                <h2>Alerts &amp; refresh</h2>
                <p className="panel-copy">Choose how often Scorch re-reads the tape.</p>
                <div className="controls">
                  <label>
                    Auto refresh
                    <select
                      value={refreshMs}
                      onChange={(e) => setRefreshMs(Number(e.target.value))}
                    >
                      {REFRESH_OPTIONS.map((o) => (
                        <option key={o.label} value={o.ms}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={notify}
                      onChange={(e) => setNotify(e.target.checked)}
                    />
                    Notify on leader shift
                  </label>
                </div>
                <p className="meta-line">
                  Refresh: {refreshLabel} · SPY {fmtPct(data.benchmark.change1d)} · {data.asOf}
                </p>
              </section>

              <section>
                <div className="section-head">
                  <h2>Sector heat board</h2>
                  <p>GICS sectors ranked by multi-horizon heat vs SPY.</p>
                </div>
                <div className="card-grid">
                  {data.dayBoard.map((row) => (
                    <SleeveCard key={row.id} row={row} />
                  ))}
                </div>
              </section>

              <section>
                <div className="section-head">
                  <h2>Hot themes</h2>
                  <p>Theme baskets ranked by 1-day move.</p>
                </div>
                <div className="card-grid compact">
                  {data.themes.map((row) => (
                    <SleeveCard key={`theme-${row.id}`} row={row} />
                  ))}
                </div>
              </section>

              <section>
                <div className="section-head">
                  <h2>Top stocks</h2>
                  <p>Top 20 holdings by the same heat score.</p>
                </div>
                <div className="stock-table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Symbol</th>
                        <th>1D</th>
                        <th>1M</th>
                        <th>Heat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stocks.map((s) => (
                        <tr key={s.ticker}>
                          <td>{s.rank}</td>
                          <td>
                            <strong>{s.ticker}</strong>
                            <span>{s.company}</span>
                          </td>
                          <td className={s.change1d >= 0 ? "up" : "down"}>{fmtPct(s.change1d)}</td>
                          <td className={s.change1m >= 0 ? "up" : "down"}>{fmtPct(s.change1m)}</td>
                          <td>{s.heat.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <div className="section-head">
                  <h2>Smart notes</h2>
                  <p>Only the distinct signals — leader, regime, rotation, weakness, reversals.</p>
                </div>
                <div className="note-grid">
                  {data.ideaNotes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
