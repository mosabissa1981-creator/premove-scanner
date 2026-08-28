import { NextResponse } from "next/server";
import { QuantDataClient, resolveApiKey } from "@/lib/quantdata/client";
import { analyzeTicker } from "@/lib/scoring/confluence";
import type { GainersLosersResponse } from "@/lib/quantdata/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const apiKey = resolveApiKey(request.headers.get("x-quantdata-api-key"));
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  try {
    const client = new QuantDataClient(apiKey);
    const gainers = (await client.gainersLosers({
      filter: { tickers: [ticker] },
    })) as GainersLosersResponse;

    const entry = gainers.data[ticker] ?? {
      bearishPremium: 0,
      bullishPremium: 0,
      premium: 0,
      premiumRatio: 1,
      tradeCount: 0,
      volume: 0,
    };

    const analysis = await analyzeTicker(client, ticker, entry);
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
