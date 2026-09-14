export type AlertKind = "ready" | "breakout" | "pnl";

export interface AlertEvent {
  kind: AlertKind;
  ticker: string;
  title: string;
  body: string;
  /** Optional deep-link path inside the app */
  url?: string;
}

export interface TelegramPrefs {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface WebPushPrefs {
  enabled: boolean;
}

export interface AlertPrefs {
  webPush: WebPushPrefs;
  telegram: TelegramPrefs;
  /** Notify when a new Ready setup appears after a scan. */
  notifyReady: boolean;
  /** Notify when a Ready name closes above resistance (checked on refresh). */
  notifyBreakout: boolean;
  /** Notify P&L updates for tracked entries. */
  notifyPnL: boolean;
}

export interface TrackedEntry {
  ticker: string;
  entryPrice: number;
  /** Resistance level at entry time (optional). */
  resistance?: number | null;
  note?: string;
  openedAt: string;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}
