import { NextResponse } from "next/server";

export async function GET() {
  const hasServerKey = Boolean(process.env.QUANTDATA_API_KEY?.trim());
  return NextResponse.json({
    hasServerKey,
    message: hasServerKey
      ? "Server API key configured. You can also use your own key in Settings."
      : "Add QUANTDATA_API_KEY to .env.local or enter your key in Settings.",
  });
}
