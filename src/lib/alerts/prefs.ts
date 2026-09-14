/**
 * Client-side alert preferences (localStorage).
 * Telegram credentials stay on-device; web-push subscription is also stored locally.
 */

import type {
  AlertPrefs,
  PushSubscriptionJSON,
  TrackedEntry,
} from "@/lib/alerts/types";

export const ALERT_PREFS_KEY = "premove_alert_prefs_v1";
export const ALERT_ENTRIES_KEY = "premove_alert_entries_v1";
export const ALERT_PUSH_SUB_KEY = "premove_web_push_subscription_v1";
export const ALERT_LAST_READY_KEY = "premove_alert_last_ready_v1";
export const ALERT_LAST_BREAKOUT_KEY = "premove_alert_last_breakout_v1";
export const ALERT_LAST_PNL_KEY = "premove_alert_last_pnl_v1";

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  webPush: { enabled: false },
  telegram: { enabled: false, botToken: "", chatId: "" },
  notifyReady: true,
  notifyBreakout: true,
  notifyPnL: true,
};

export function loadAlertPrefs(): AlertPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_ALERT_PREFS, telegram: { ...DEFAULT_ALERT_PREFS.telegram }, webPush: { ...DEFAULT_ALERT_PREFS.webPush } };
  try {
    const raw = window.localStorage.getItem(ALERT_PREFS_KEY);
    if (!raw) {
      return {
        ...DEFAULT_ALERT_PREFS,
        telegram: { ...DEFAULT_ALERT_PREFS.telegram },
        webPush: { ...DEFAULT_ALERT_PREFS.webPush },
      };
    }
    const parsed = JSON.parse(raw) as Partial<AlertPrefs>;
    return {
      webPush: {
        enabled: Boolean(parsed.webPush?.enabled),
      },
      telegram: {
        enabled: Boolean(parsed.telegram?.enabled),
        botToken:
          typeof parsed.telegram?.botToken === "string" ? parsed.telegram.botToken : "",
        chatId: typeof parsed.telegram?.chatId === "string" ? parsed.telegram.chatId : "",
      },
      notifyReady: parsed.notifyReady ?? true,
      notifyBreakout: parsed.notifyBreakout ?? true,
      notifyPnL: parsed.notifyPnL ?? true,
    };
  } catch {
    return {
      ...DEFAULT_ALERT_PREFS,
      telegram: { ...DEFAULT_ALERT_PREFS.telegram },
      webPush: { ...DEFAULT_ALERT_PREFS.webPush },
    };
  }
}

export function saveAlertPrefs(prefs: AlertPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERT_PREFS_KEY, JSON.stringify(prefs));
}

export function loadPushSubscription(): PushSubscriptionJSON | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ALERT_PUSH_SUB_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PushSubscriptionJSON;
  } catch {
    return null;
  }
}

export function savePushSubscription(sub: PushSubscriptionJSON | null): void {
  if (typeof window === "undefined") return;
  if (!sub) {
    window.localStorage.removeItem(ALERT_PUSH_SUB_KEY);
    return;
  }
  window.localStorage.setItem(ALERT_PUSH_SUB_KEY, JSON.stringify(sub));
}

export function loadTrackedEntries(): TrackedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ALERT_ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackedEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrackedEntries(entries: TrackedEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERT_ENTRIES_KEY, JSON.stringify(entries));
}

export function loadLastReadyTickers(): string[] {
  return loadStringList(ALERT_LAST_READY_KEY);
}

export function saveLastReadyTickers(tickers: string[]): void {
  saveStringList(ALERT_LAST_READY_KEY, tickers);
}

export function loadLastBreakoutTickers(): string[] {
  return loadStringList(ALERT_LAST_BREAKOUT_KEY);
}

export function saveLastBreakoutTickers(tickers: string[]): void {
  saveStringList(ALERT_LAST_BREAKOUT_KEY, tickers);
}

/** Map of ticker → last notified P&L bucket (e.g. "+5", "-3"). */
export function loadLastPnLBuckets(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ALERT_LAST_PNL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLastPnLBuckets(buckets: Record<string, string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERT_LAST_PNL_KEY, JSON.stringify(buckets));
}

export function anyDeliveryChannelEnabled(prefs: AlertPrefs): boolean {
  return prefs.webPush.enabled || prefs.telegram.enabled;
}

function loadStringList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.map((t) => String(t).toUpperCase()) : [];
  } catch {
    return [];
  }
}

function saveStringList(key: string, tickers: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    key,
    JSON.stringify(tickers.map((t) => t.toUpperCase())),
  );
}
