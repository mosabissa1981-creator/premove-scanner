import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { analyzeTicker } from "@/lib/scoring/confluence";
import type { CandidateMeta, OptionsVolumeEntry } from "@/lib/unusualwhales/types";
import type { UwDataResponse, UwOptionsVolume } from "@/lib/unusualwhales/types";

function volumeEntry(vol: UwOptionsVolume): OptionsVolumeEntry {
  const bullish = parseFloat(vol.bullish_premium) || 0;
  const bearish = parseFloat(vol.bearish_premium) || 0;
  return {
    bullishPremium: bullish,
    bearishPremium: bearish,
    premium: (parseFloat(vol.call_premium) || 0) + (parseFloat(vol.put_premium) || 0),
    premiumRatio: bullish > 0 ? bearish / bullish : 1,
    tradeCount: 0,
    volume: (vol.call_volume ?? 0) + (vol.put_volume ?? 0),
  };
}

const emptyEntry: OptionsVolumeEntry = {
  bearishPremium: 0,
  bullishPremium: 0,
  premium: 0,
  premiumRatio: 1,
  tradeCount: 0,
  volume: 0,
};

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
      let entry = emptyEntry;
      try {
        const volRes = (await client.optionsVolume(ticker)) as UwDataResponse<UwOptionsVolume[]>;
        if (volRes.data?.[0]) entry = volumeEntry(volRes.data[0]);
      } catch {
        // continue with empty entry
      }

      const candidate: CandidateMeta = {
        ticker,
        entry,
        inCoilScreener: false,
        inFlowAlerts: false,
      };

      results.push(await analyzeTicker(client, candidate));
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
