import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "uw_api_key";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
    const apiKey = body.apiKey?.trim();

    if (!apiKey) {
      return NextResponse.json({ error: "API key is empty" }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true, message: "API key saved" });
    response.cookies.set(COOKIE_NAME, apiKey, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: "API key cleared" });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
