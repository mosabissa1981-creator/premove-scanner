/**
 * Browser helpers for Web Push subscribe / unsubscribe.
 */

import type { PushSubscriptionJSON } from "@/lib/alerts/types";
import { savePushSubscription } from "@/lib/alerts/prefs";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function pushSubscriptionToJSON(
  sub: PushSubscription,
): PushSubscriptionJSON | null {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

export async function registerAlertServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function subscribeWebPush(
  vapidPublicKey: string,
): Promise<{ ok: true; subscription: PushSubscriptionJSON } | { ok: false; error: string }> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "Web Push is not supported in this browser." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission denied." };
  }

  const registration =
    (await navigator.serviceWorker.getRegistration()) ??
    (await registerAlertServiceWorker());
  if (!registration) {
    return { ok: false, error: "Could not register service worker." };
  }

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  }

  const json = pushSubscriptionToJSON(subscription);
  if (!json) {
    return { ok: false, error: "Push subscription missing keys." };
  }
  savePushSubscription(json);
  return { ok: true, subscription: json };
}

export async function unsubscribeWebPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    savePushSubscription(null);
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe().catch(() => undefined);
  savePushSubscription(null);
}
