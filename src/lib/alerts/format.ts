import type { AlertEvent } from "@/lib/alerts/types";
import type { TickerAnalysis } from "@/lib/unusualwhales/types";

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}

/** Lock-screen style Ready alert (Chief-of-Staff vibe). */
export function formatReadyAlert(row: TickerAnalysis): AlertEvent {
  const r = money(row.resistanceLevel);
  const px = money(row.stockPrice);
  return {
    kind: "ready",
    ticker: row.ticker,
    title: `Ready setup: ${row.ticker}`,
    body: `${row.ticker} ${px} · score ${row.score}/${row.maxScore} · Coil ${row.coilScore} · R ${r}. Buy calls/debit spreads on close above resistance — 1–2 week hold. Screener only — not financial advice.`,
    url: `/ticker/${row.ticker}`,
  };
}

/** Breakout confirmation alert. */
export function formatBreakoutAlert(row: TickerAnalysis): AlertEvent {
  const r = money(row.resistanceLevel);
  const px = money(row.stockPrice);
  return {
    kind: "breakout",
    ticker: row.ticker,
    title: `Breakout: ${row.ticker}`,
    body: `${row.ticker} live ${px} above resistance ${r}. Options entry zone for 1–2 week swing. Screener only — not financial advice.`,
    url: `/ticker/${row.ticker}`,
  };
}

/** P&L update like the Telegram channel style. */
export function formatPnLAlert(input: {
  ticker: string;
  entryPrice: number;
  livePrice: number;
  note?: string;
}): AlertEvent {
  const pct = ((input.livePrice - input.entryPrice) / input.entryPrice) * 100;
  const sign = pct >= 0 ? "+" : "";
  const trophy = pct >= 0 ? "🏆" : "📉";
  return {
    kind: "pnl",
    ticker: input.ticker,
    title: `${trophy} ${input.ticker} P&L ${sign}${pct.toFixed(1)}%`,
    body: `${input.ticker}${input.note ? ` · ${input.note}` : ""}\n✅ Entry: ${money(input.entryPrice)}\n${trophy} Live: ${money(input.livePrice)} (${sign}${pct.toFixed(1)}%)\nScreener only — not financial advice.`,
    url: `/ticker/${input.ticker}`,
  };
}

export function formatTelegramMessage(event: AlertEvent): string {
  return `<b>${escapeHtml(event.title)}</b>\n${escapeHtml(event.body)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
