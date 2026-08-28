import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const hasServerKey = Boolean(process.env.UNUSUAL_WHALES_API_KEY?.trim());
  const cookieStore = await cookies();
  const hasCookie = Boolean(cookieStore.get("uw_api_key")?.value?.trim());

  return NextResponse.json({
    hasServerKey,
    hasCookie,
    hasKey: hasServerKey || hasCookie,
    provider: "unusual-whales",
    message: hasServerKey || hasCookie
      ? "API key is configured."
      : "Add your Unusual Whales API key in Settings.",
  });
}
