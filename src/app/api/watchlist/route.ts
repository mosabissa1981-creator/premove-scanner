import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { runTickerAnalysis } from "@/lib/scoring/confluence";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const apiKey = resolveApiKey(
    request.headers.get("x-uw-api-key"),
    cookieStore.get("uw_api_key")?.value,
  );
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const body = (await request.json()) as { tickers?: string[] };
  const tickers = (body.tickers ?? [])
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (tickers.length === 0) {
    return NextResponse.json({ results: [], errors: [] });
  }

  const client = new UnusualWhalesClient(apiKey);
  const results = [];
  const errors: string[] = [];

  for (const ticker of tickers) {
    try {
      results.push(await runTickerAnalysis(client, ticker));
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  const tierOrder = { ready: 0, "setting-up": 1, early: 2, watch: 3 };
  results.sort(
    (a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.score - a.score,
  );

  return NextResponse.json({ results, errors });
}
