import { NextResponse } from "next/server";
import { QuantDataClient, resolveApiKey } from "@/lib/quantdata/client";
import { runConfluenceScan } from "@/lib/scoring/confluence";

export async function GET(request: Request) {
  const apiKey = resolveApiKey(request.headers.get("x-quantdata-api-key"));
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key required. Set QUANTDATA_API_KEY or pass x-quantdata-api-key header." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "15");
  const minPremium = Number(searchParams.get("minPremium") ?? "1000000");

  try {
    const client = new QuantDataClient(apiKey);
    const { results, candidatesScreened, errors } = await runConfluenceScan(client, {
      limit: Math.min(limit, 25),
      minPremium,
    });

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      candidatesScreened,
      results,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}
