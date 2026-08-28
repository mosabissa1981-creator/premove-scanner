import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const apiKey = resolveApiKey(
    request.headers.get("x-uw-api-key"),
    cookieStore.get("uw_api_key")?.value,
  );

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "No API key" }, { status: 401 });
  }

  try {
    const client = new UnusualWhalesClient(apiKey);
    await client.stockScreener({ ticker: "SPY" });
    return NextResponse.json({ ok: true, message: "API key works" });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid API key",
      },
      { status: 400 },
    );
  }
}
