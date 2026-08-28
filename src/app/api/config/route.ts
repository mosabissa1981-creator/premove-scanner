import { NextResponse } from "next/server";

export async function GET() {
  const hasServerKey = Boolean(process.env.UNUSUAL_WHALES_API_KEY?.trim());
  return NextResponse.json({
    hasServerKey,
    provider: "unusual-whales",
    message: hasServerKey
      ? "Unusual Whales API key configured. You can also use your own key in Settings."
      : "Add UNUSUAL_WHALES_API_KEY to .env.local or enter your key in Settings.",
  });
}
