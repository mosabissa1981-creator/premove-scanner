import { NextResponse } from "next/server";
import { sendTelegramAlert } from "@/lib/alerts/telegram";

type TestBody = {
  botToken?: string;
  chatId?: string;
};

export async function POST(request: Request) {
  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const botToken = body.botToken?.trim() ?? "";
  const chatId = body.chatId?.trim() ?? "";
  if (!botToken || !chatId) {
    return NextResponse.json(
      { ok: false, error: "Bot token and chat ID are required." },
      { status: 400 },
    );
  }

  const result = await sendTelegramAlert({
    botToken,
    chatId,
    event: {
      kind: "ready",
      ticker: "TEST",
      title: "PreMove Scanner — Telegram connected",
      body: "Test alert OK. You will get Ready / breakout / P&L alerts here when enabled in Settings.",
      url: "/settings",
    },
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
