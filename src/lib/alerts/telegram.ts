import type { AlertEvent } from "@/lib/alerts/types";
import { formatTelegramMessage } from "@/lib/alerts/format";

export async function sendTelegramAlert(input: {
  botToken: string;
  chatId: string;
  event: AlertEvent;
}): Promise<{ ok: boolean; error?: string }> {
  const token = input.botToken.trim();
  const chatId = input.chatId.trim();
  if (!token || !chatId) {
    return { ok: false, error: "Telegram bot token and chat ID are required." };
  }

  const text = formatTelegramMessage(input.event);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description ?? `Telegram HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Telegram send failed" };
  }
}
