"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AlertPrefs, TrackedEntry } from "@/lib/alerts/types";
import {
  DEFAULT_ALERT_PREFS,
  loadAlertPrefs,
  loadPushSubscription,
  loadTrackedEntries,
  saveAlertPrefs,
  saveTrackedEntries,
} from "@/lib/alerts/prefs";
import {
  registerAlertServiceWorker,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/alerts/web-push-client";
import { sendAlertEvents } from "@/lib/alerts/client-notify";

export function AlertsSettings() {
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);
  const [entries, setEntries] = useState<TrackedEntry[]>([]);
  const [vapidConfigured, setVapidConfigured] = useState<boolean | null>(null);
  const [hasPushSub, setHasPushSub] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [entryTicker, setEntryTicker] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryNote, setEntryNote] = useState("");

  useEffect(() => {
    setPrefs(loadAlertPrefs());
    setEntries(loadTrackedEntries());
    setHasPushSub(Boolean(loadPushSubscription()));
    void registerAlertServiceWorker();
    void fetch("/api/alerts/vapid")
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => {
        setVapidConfigured(Boolean(data.configured));
      })
      .catch(() => setVapidConfigured(false));
  }, []);

  function persist(next: AlertPrefs) {
    setPrefs(next);
    saveAlertPrefs(next);
  }

  async function enableWebPush() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const vapidRes = await fetch("/api/alerts/vapid");
      const vapid = (await vapidRes.json()) as {
        configured?: boolean;
        publicKey?: string | null;
        error?: string;
      };
      if (!vapid.configured || !vapid.publicKey) {
        setError(vapid.error ?? "VAPID keys not configured on the server.");
        return;
      }
      const result = await subscribeWebPush(vapid.publicKey);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHasPushSub(true);
      persist({ ...prefs, webPush: { enabled: true } });
      setStatus("Web Push enabled — lock-screen alerts are on.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable Web Push");
    } finally {
      setBusy(false);
    }
  }

  async function disableWebPush() {
    setBusy(true);
    setError("");
    try {
      await unsubscribeWebPush();
      setHasPushSub(false);
      persist({ ...prefs, webPush: { enabled: false } });
      setStatus("Web Push disabled.");
    } finally {
      setBusy(false);
    }
  }

  async function testTelegram() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/alerts/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: prefs.telegram.botToken,
          chatId: prefs.telegram.chatId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Telegram test failed");
        return;
      }
      persist({
        ...prefs,
        telegram: { ...prefs.telegram, enabled: true },
      });
      setStatus("Telegram test sent — check your chat.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telegram test failed");
    } finally {
      setBusy(false);
    }
  }

  async function testAllChannels() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { sent, errors } = await sendAlertEvents([
        {
          kind: "ready",
          ticker: "TEST",
          title: "PreMove Scanner — test alert",
          body: "Web Push + Telegram channels OK. Screener only — not financial advice.",
          url: "/settings",
        },
      ]);
      if (sent > 0) setStatus(`Test sent on ${sent} channel path(s).`);
      else setError(errors[0] ?? "No channels delivered the test.");
    } finally {
      setBusy(false);
    }
  }

  function addEntry(event: FormEvent) {
    event.preventDefault();
    const ticker = entryTicker.trim().toUpperCase();
    const price = Number(entryPrice);
    if (!ticker || !Number.isFinite(price) || price <= 0) {
      setError("Enter a ticker and a valid entry price.");
      return;
    }
    const next: TrackedEntry[] = [
      ...entries.filter((e) => e.ticker.toUpperCase() !== ticker),
      {
        ticker,
        entryPrice: price,
        note: entryNote.trim() || undefined,
        openedAt: new Date().toISOString(),
      },
    ];
    setEntries(next);
    saveTrackedEntries(next);
    setEntryTicker("");
    setEntryPrice("");
    setEntryNote("");
    setStatus(`Bought ${ticker} — see Holdings for live P&L.`);
    setError("");
  }

  function removeEntry(ticker: string) {
    const next = entries.filter((e) => e.ticker.toUpperCase() !== ticker.toUpperCase());
    setEntries(next);
    saveTrackedEntries(next);
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">Alerts</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Lock-screen Web Push and Telegram — Ready setups, breakouts, and tracked P&amp;L.
          Credentials stay on this device.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Notify on</p>
        {(
          [
            ["notifyReady", "Good time to watch (new Ready setups)"],
            ["notifyBreakout", "Good time for entry (breakout)"],
            ["notifyPnL", "Bought holdings price moves (5% buckets)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => persist({ ...prefs, [key]: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Web Push (lock screen)</p>
        {vapidConfigured === false && (
          <p className="text-xs text-amber-300/90">
            Server VAPID keys are not set. Add <code className="text-amber-200">VAPID_PUBLIC_KEY</code>{" "}
            and <code className="text-amber-200">VAPID_PRIVATE_KEY</code> on Vercel to enable push.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy || vapidConfigured === false}
            onClick={() => void enableWebPush()}
            className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-black disabled:opacity-50"
          >
            {prefs.webPush.enabled && hasPushSub ? "Web Push on" : "Enable Web Push"}
          </button>
          {(prefs.webPush.enabled || hasPushSub) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void disableWebPush()}
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-400"
            >
              Disable
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Telegram</p>
        <p className="text-xs text-zinc-500">
          Create a bot with @BotFather, then message it and get your chat ID from @userinfobot.
        </p>
        <label className="block text-xs text-zinc-500">
          Bot token
          <input
            type="password"
            value={prefs.telegram.botToken}
            onChange={(e) =>
              persist({
                ...prefs,
                telegram: { ...prefs.telegram, botToken: e.target.value },
              })
            }
            placeholder="123456:ABC..."
            className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Chat ID
          <input
            type="text"
            value={prefs.telegram.chatId}
            onChange={(e) =>
              persist({
                ...prefs,
                telegram: { ...prefs.telegram, chatId: e.target.value },
              })
            }
            placeholder="123456789"
            className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm"
            autoComplete="off"
          />
        </label>
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={prefs.telegram.enabled}
            onChange={(e) =>
              persist({
                ...prefs,
                telegram: { ...prefs.telegram, enabled: e.target.checked },
              })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
          />
          Enable Telegram alerts
        </label>
        <button
          type="button"
          disabled={busy || !prefs.telegram.botToken || !prefs.telegram.chatId}
          onClick={() => void testTelegram()}
          className="w-full rounded-xl border border-zinc-600 py-3 text-sm font-medium text-zinc-200 disabled:opacity-50"
        >
          Send Telegram test
        </button>
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-200">Bought holdings (P&amp;L)</p>
          <a href="/holdings" className="text-xs text-emerald-400 underline">Open Holdings →</a>
        </div>
        <form onSubmit={addEntry} className="grid gap-2 sm:grid-cols-3">
          <input
            value={entryTicker}
            onChange={(e) => setEntryTicker(e.target.value)}
            placeholder="Ticker"
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm uppercase"
          />
          <input
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="Entry $"
            inputMode="decimal"
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm"
          />
          <input
            value={entryNote}
            onChange={(e) => setEntryNote(e.target.value)}
            placeholder="Note (optional)"
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm sm:col-span-3"
          />
          <button
            type="submit"
            className="rounded-xl bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 sm:col-span-3"
          >
            Add Bought holding
          </button>
        </form>
        {entries.length > 0 ? (
          <ul className="space-y-2 text-sm text-zinc-300">
            {entries.map((e) => (
              <li
                key={e.ticker}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2"
              >
                <span>
                  <span className="font-semibold text-zinc-100">{e.ticker}</span> @ $
                  {e.entryPrice}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeEntry(e.ticker)}
                  className="text-xs text-zinc-500 underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-zinc-500">No Bought tickers yet — mark Bought on a ticker page.</p>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void testAllChannels()}
        className="w-full rounded-xl border border-emerald-500/40 py-3 text-sm font-medium text-emerald-300 disabled:opacity-50"
      >
        Send test on enabled channels
      </button>

      {status && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {status}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
