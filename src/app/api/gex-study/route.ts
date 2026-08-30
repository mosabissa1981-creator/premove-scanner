import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { fetchGexStudy, resolveStudyExpiry } from "@/lib/gex-study/gex-study";
import { normalizeTicker } from "@/lib/gex-scan/gex-scan";
import type { GexExpiryMode, UwDataResponse, UwGreekExposureExpiryRow } from "@/lib/unusualwhales/types";

const EXPIRY_MODES = new Set<GexExpiryMode>(["daily", "weekly", "monthly", "all"]);

export const maxDuration = 60;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const apiKey = resolveApiKey(
    request.headers.get("x-uw-api-key"),
    cookieStore.get("uw_api_key")?.value,
  );
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "API key required. Set UNUSUAL_WHALES_API_KEY or pass x-uw-api-key header.",
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const ticker = normalizeTicker(searchParams.get("ticker") ?? "");
  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
  }

  const expiryParam = searchParams.get("expiry");
  const modeParam = (searchParams.get("mode") ?? "weekly") as GexExpiryMode;
  const mode = EXPIRY_MODES.has(modeParam) ? modeParam : "weekly";

  try {
    const client = new UnusualWhalesClient(apiKey);

    if (expiryParam === "all") {
      const result = await fetchGexStudy(client, ticker, "all");
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    if (expiryParam) {
      const result = await fetchGexStudy(client, ticker, expiryParam.slice(0, 10));
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    const exposureRes = (await client.greekExposureByExpiry(
      ticker,
    )) as UwDataResponse<UwGreekExposureExpiryRow[]>;
    const expiry =
      mode === "all"
        ? "all"
        : resolveStudyExpiry(exposureRes.data ?? [], null, mode);
    const result = await fetchGexStudy(client, ticker, expiry);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GEX study failed" },
      { status: 500 },
    );
  }
}
