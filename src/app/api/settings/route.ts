import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  clearApiKeyCookie,
  normalizeApiKey,
  setApiKeyCookie,
} from "@/lib/api-key-cookie";

export async function GET() {
  const hasServerKey = Boolean(process.env.UNUSUAL_WHALES_API_KEY?.trim());
  const cookieStore = await cookies();
  const hasCookie = Boolean(cookieStore.get(COOKIE_NAME)?.value?.trim());

  return NextResponse.json({
    hasServerKey,
    hasCookie,
    provider: "unusual-whales",
    message: hasServerKey
      ? "Unusual Whales API key configured on server."
      : hasCookie
        ? "API key saved in this browser."
        : "Add your Unusual Whales API key in Settings.",
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { apiKey?: string };
    const apiKey = normalizeApiKey(body.apiKey ?? "");

    if (!apiKey) {
      return NextResponse.json({ error: "API key is empty" }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true, message: "API key saved" });
    setApiKeyCookie(response, apiKey);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: "API key cleared" });
  clearApiKeyCookie(response);
  return response;
}
