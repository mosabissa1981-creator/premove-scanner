import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { MAX_GEX_TICKERS, parseTickers, runGexScan } from "@/lib/gex-scan/gex-scan";
import type { GexExpiryMode } from "@/lib/unusualwhales/types";

const EXPIRY_MODES = new Set<GexExpiryMode>(["daily", "weekly", "monthly", "all"]);

export async function POST(request: Request) {
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

  let body: { tickers?: string; expiry?: string };
  try {
    body = (await request.json()) as { tickers?: string; expiry?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tickers = parseTickers(body.tickers ?? "");
  if (!tickers.length) {
    return NextResponse.json({ error: "Add at least one ticker." }, { status: 400 });
  }
  if (tickers.length > MAX_GEX_TICKERS) {
    return NextResponse.json(
      { error: `Max ${MAX_GEX_TICKERS} tickers per scan.` },
      { status: 400 },
    );
  }

  const expiryMode = (body.expiry ?? "daily") as GexExpiryMode;
  if (!EXPIRY_MODES.has(expiryMode)) {
    return NextResponse.json({ error: "Invalid expiry mode." }, { status: 400 });
  }

  try {
    const client = new UnusualWhalesClient(apiKey);
    const { rows, errors, expiration } = await runGexScan(client, tickers, expiryMode);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      expiration,
      expiryMode,
      tickersRequested: tickers.length,
      results: rows,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GEX scan failed" },
      { status: 500 },
    );
  }
}
