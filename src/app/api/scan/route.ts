import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { parseScanMode, runConfluenceScan } from "@/lib/scoring/confluence";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const apiKey = resolveApiKey(
    request.headers.get("x-uw-api-key"),
    cookieStore.get("uw_api_key")?.value,
  );
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
  const limit = Number(searchParams.get("limit") ?? "25");
  const mode = parseScanMode(searchParams.get("mode"));

  try {
    const client = new UnusualWhalesClient(apiKey);
    const { results, candidatesScreened, errors, strategy, mode: scanMode } =
      await runConfluenceScan(client, {
        limit: Math.min(Math.max(limit, 1), 40),
        mode,
      });

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      candidatesScreened,
      results,
      errors,
      strategy,
      mode: scanMode,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}
