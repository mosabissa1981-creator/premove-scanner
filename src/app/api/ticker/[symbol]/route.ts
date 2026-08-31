import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { runTickerAnalysis } from "@/lib/scoring/confluence";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const cookieStore = await cookies();
  const apiKey = resolveApiKey(
    request.headers.get("x-uw-api-key"),
    cookieStore.get("uw_api_key")?.value,
  );
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  try {
    const client = new UnusualWhalesClient(apiKey);
    const analysis = await runTickerAnalysis(client, ticker);
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
