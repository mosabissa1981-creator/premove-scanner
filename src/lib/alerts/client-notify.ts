/**
 * Client entry: after a scan, build alert events and POST to /api/alerts/send.
 */

import { collectScanAlerts } from "@/lib/alerts/scan-alerts";
import {
  anyDeliveryChannelEnabled,
  loadAlertPrefs,
  loadLastBreakoutTickers,
  loadLastPnLBuckets,
  loadLastReadyTickers,
  loadPushSubscription,
  loadTrackedEntries,
  saveLastBreakoutTickers,
  saveLastPnLBuckets,
  saveLastReadyTickers,
  savePushSubscription,
} from "@/lib/alerts/prefs";
import type { AlertEvent } from "@/lib/alerts/types";
import type { ScanResult } from "@/lib/unusualwhales/types";

export async function sendAlertEvents(events: AlertEvent[]): Promise<{
  sent: number;
  errors: string[];
}> {
  if (events.length === 0) return { sent: 0, errors: [] };

  const prefs = loadAlertPrefs();
  if (!anyDeliveryChannelEnabled(prefs)) {
    return { sent: 0, errors: [] };
  }

  const pushSubscription = prefs.webPush.enabled ? loadPushSubscription() : null;
  const errors: string[] = [];
  let sent = 0;

  for (const event of events) {
    try {
      const res = await fetch("/api/alerts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          prefs: {
            webPush: prefs.webPush,
            telegram: prefs.telegram,
          },
          pushSubscription,
        }),
      });
      const data = (await res.json()) as {
        sent?: boolean;
        webPush?: { gone?: boolean; error?: string };
        telegram?: { error?: string };
        error?: string;
      };
      if (!res.ok) {
        errors.push(data.error ?? `HTTP ${res.status}`);
        continue;
      }
      if (data.webPush?.gone) {
        savePushSubscription(null);
      }
      if (data.sent) sent += 1;
      else {
        const parts = [data.telegram?.error, data.webPush?.error].filter(Boolean);
        if (parts.length) errors.push(parts.join("; "));
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Send failed");
    }
  }

  return { sent, errors };
}

/** Diff scan vs prior Ready set / breakouts / P&L and notify enabled channels. */
export async function processScanAlerts(scan: ScanResult): Promise<{
  sent: number;
  events: AlertEvent[];
  errors: string[];
}> {
  const prefs = loadAlertPrefs();
  if (!anyDeliveryChannelEnabled(prefs)) {
    // Still update Ready snapshot so the next enable doesn't blast the whole list.
    saveLastReadyTickers(
      scan.results.filter((r) => r.tier === "ready").map((r) => r.ticker),
    );
    return { sent: 0, events: [], errors: [] };
  }

  const collected = collectScanAlerts({
    results: scan.results,
    prefs,
    previousReady: loadLastReadyTickers(),
    previousBreakouts: loadLastBreakoutTickers(),
    trackedEntries: loadTrackedEntries(),
    previousPnLBuckets: loadLastPnLBuckets(),
  });

  saveLastReadyTickers(collected.nextReady);
  saveLastBreakoutTickers(collected.nextBreakouts);
  saveLastPnLBuckets(collected.nextPnLBuckets);

  const { sent, errors } = await sendAlertEvents(collected.events);
  return { sent, events: collected.events, errors };
}
