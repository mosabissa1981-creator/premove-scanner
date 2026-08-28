import { NextResponse } from "next/server";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { runConfluenceScan } from "@/lib/scoring/confluence";

export async function GET(request: Request) {
  const apiKey = resolveApiKey(request.headers.get("x-uw-api-key"));
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "API key required. Set UNUSUAL_WHALES_API_KEY or pass x-uw-api-key header.",
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "15");
  const minPremium = Number(searchParams.get("minPremium") ?? "1000000");

  try {
    const client = new UnusualWhalesClient(apiKey);
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
