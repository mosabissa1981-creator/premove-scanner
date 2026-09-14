import { NextResponse } from "next/server";
import { dispatchAlert } from "@/lib/alerts/dispatch";
import type { AlertEvent, AlertPrefs, PushSubscriptionJSON } from "@/lib/alerts/types";

type SendBody = {
  event?: AlertEvent;
  prefs?: Pick<AlertPrefs, "webPush" | "telegram">;
  pushSubscription?: PushSubscriptionJSON | null;
};

function isAlertEvent(value: unknown): value is AlertEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<AlertEvent>;
  return (
    (e.kind === "ready" || e.kind === "breakout" || e.kind === "pnl") &&
    typeof e.ticker === "string" &&
    typeof e.title === "string" &&
    typeof e.body === "string"
  );
}

export async function POST(request: Request) {
  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isAlertEvent(body.event)) {
    return NextResponse.json({ error: "Invalid alert event" }, { status: 400 });
  }

  const prefs = body.prefs ?? {
    webPush: { enabled: false },
    telegram: { enabled: false, botToken: "", chatId: "" },
  };

  if (!prefs.webPush?.enabled && !prefs.telegram?.enabled) {
    return NextResponse.json({ error: "No alert channels enabled" }, { status: 400 });
  }

  const result = await dispatchAlert({
    prefs: {
      webPush: { enabled: Boolean(prefs.webPush?.enabled) },
      telegram: {
        enabled: Boolean(prefs.telegram?.enabled),
        botToken: prefs.telegram?.botToken ?? "",
        chatId: prefs.telegram?.chatId ?? "",
      },
    },
    event: body.event,
    pushSubscription: body.pushSubscription ?? null,
  });

  return NextResponse.json(result);
}
