/**
 * Fan-out alert delivery to enabled channels (Telegram + Web Push).
 */

import { sendTelegramAlert } from "@/lib/alerts/telegram";
import { sendWebPushAlert } from "@/lib/alerts/web-push-server";
import type { AlertEvent, AlertPrefs, PushSubscriptionJSON } from "@/lib/alerts/types";

export type DispatchAlertInput = {
  prefs: Pick<AlertPrefs, "webPush" | "telegram">;
  event: AlertEvent;
  pushSubscription?: PushSubscriptionJSON | null;
};

export type DispatchAlertResult = {
  telegram?: { ok: boolean; error?: string };
  webPush?: { ok: boolean; error?: string; gone?: boolean };
  sent: boolean;
};

export async function dispatchAlert(
  input: DispatchAlertInput,
): Promise<DispatchAlertResult> {
  const result: DispatchAlertResult = { sent: false };
  const tasks: Promise<void>[] = [];

  if (
    input.prefs.telegram.enabled &&
    input.prefs.telegram.botToken &&
    input.prefs.telegram.chatId
  ) {
    tasks.push(
      sendTelegramAlert({
        botToken: input.prefs.telegram.botToken,
        chatId: input.prefs.telegram.chatId,
        event: input.event,
      }).then((r) => {
        result.telegram = r;
      }),
    );
  }

  if (input.prefs.webPush.enabled && input.pushSubscription) {
    tasks.push(
      sendWebPushAlert({
        subscription: input.pushSubscription,
        event: input.event,
      }).then((r) => {
        result.webPush = r;
      }),
    );
  }

  if (tasks.length === 0) {
    return result;
  }

  await Promise.all(tasks);
  result.sent = Boolean(
    (result.telegram?.ok ?? false) || (result.webPush?.ok ?? false),
  );
  return result;
}
