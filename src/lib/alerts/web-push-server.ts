import webpush from "web-push";
import type { AlertEvent, PushSubscriptionJSON } from "@/lib/alerts/types";

export function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:alerts@premove.app";
  return { publicKey, privateKey, subject };
}

export async function sendWebPushAlert(input: {
  subscription: PushSubscriptionJSON;
  event: AlertEvent;
}): Promise<{ ok: boolean; error?: string; gone?: boolean }> {
  const vapid = getVapidConfig();
  if (!vapid) {
    return { ok: false, error: "VAPID keys not configured on server." };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const payload = JSON.stringify({
    title: input.event.title,
    body: input.event.body,
    url: input.event.url ?? "/",
    kind: input.event.kind,
    ticker: input.event.ticker,
  });

  try {
    await webpush.sendNotification(input.subscription, payload);
    return { ok: true };
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, gone: true, error: "Push subscription expired." };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Web push send failed",
    };
  }
}
