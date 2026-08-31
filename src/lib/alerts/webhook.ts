import {
  detectStructuralProximity,
  proximityAlertLabel,
  type ProximityAlert,
} from "@/lib/alerts/proximity";

export interface WebhookAlertPayload {
  ticker: string;
  scorePct: number;
  alertType: string;
  spotPrice: number;
  level: number;
  distancePct: number;
  dashboardUrl: string;
}

function resolveDashboardBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return explicit.replace(/\/$/, "");
}

export function buildDashboardUrl(ticker: string): string {
  const base = resolveDashboardBaseUrl();
  const path = `/ticker/${encodeURIComponent(ticker.toUpperCase())}`;
  return base ? `${base}${path}` : path;
}

export function buildWebhookPayload(input: {
  ticker: string;
  scorePct: number;
  alert: ProximityAlert;
}): WebhookAlertPayload {
  return {
    ticker: input.ticker.toUpperCase(),
    scorePct: input.scorePct,
    alertType: proximityAlertLabel(input.alert.alertType),
    spotPrice: input.alert.spotPrice,
    level: input.alert.level,
    distancePct: input.alert.distancePct,
    dashboardUrl: buildDashboardUrl(input.ticker),
  };
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook POST failed (${res.status}): ${text || res.statusText}`);
  }
}

async function sendDiscordWebhook(payload: WebhookAlertPayload, webhookUrl: string): Promise<void> {
  const embed = {
    title: `${payload.ticker} — ${payload.alertType}`,
    description: [
      `**Confluence Score:** ${payload.scorePct.toFixed(0)}%`,
      `**Spot:** $${payload.spotPrice.toFixed(2)}`,
      `**Level:** $${payload.level.toFixed(2)}`,
      `**Distance:** ${payload.distancePct >= 0 ? "+" : ""}${payload.distancePct.toFixed(2)}%`,
      `[Open live dashboard](${payload.dashboardUrl})`,
    ].join("\n"),
    color: 0xf59e0b,
  };

  await postJson(webhookUrl, { embeds: [embed] });
}

async function sendTelegramWebhook(payload: WebhookAlertPayload, botToken: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    throw new Error("TELEGRAM_CHAT_ID is required when TELEGRAM_BOT_TOKEN is set.");
  }

  const text = [
    `*${payload.ticker}* — ${payload.alertType}`,
    `Confluence Score: ${payload.scorePct.toFixed(0)}%`,
    `Spot: $${payload.spotPrice.toFixed(2)}`,
    `Level: $${payload.level.toFixed(2)}`,
    `Distance: ${payload.distancePct >= 0 ? "+" : ""}${payload.distancePct.toFixed(2)}%`,
    `[Open dashboard](${payload.dashboardUrl})`,
  ].join("\n");

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await postJson(url, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: false,
  });
}

export async function dispatchProximityWebhook(payload: WebhookAlertPayload): Promise<void> {
  const discordUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!discordUrl && !telegramToken) return;

  const tasks: Promise<void>[] = [];
  if (discordUrl) tasks.push(sendDiscordWebhook(payload, discordUrl));
  if (telegramToken) tasks.push(sendTelegramWebhook(payload, telegramToken));
  await Promise.all(tasks);
}

export function fireProximityAlert(input: {
  ticker: string;
  scorePct: number;
  spotPrice: number | null | undefined;
  gammaFlip: number | null | undefined;
  putWall: number | null | undefined;
  callWall: number | null | undefined;
}): void {
  const alert = detectStructuralProximity(input);
  if (!alert) return;

  const payload = buildWebhookPayload({
    ticker: input.ticker,
    scorePct: input.scorePct,
    alert,
  });

  void dispatchProximityWebhook(payload).catch((err) => {
    console.error(
      `[alerts] webhook dispatch failed for ${input.ticker}:`,
      err instanceof Error ? err.message : err,
    );
  });
}
