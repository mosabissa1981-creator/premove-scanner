import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { analyzeTicker } from "@/lib/scoring/confluence";
import type { CandidateMeta, OptionsVolumeEntry } from "@/lib/unusualwhales/types";
import type { UwDataResponse, UwOptionsVolume } from "@/lib/unusualwhales/types";

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
    const volRes = (await client.optionsVolume(ticker)) as UwDataResponse<UwOptionsVolume[]>;
    const vol = volRes.data?.[0];

    const entry: OptionsVolumeEntry = vol
      ? {
          bullishPremium: parseFloat(vol.bullish_premium) || 0,
          bearishPremium: parseFloat(vol.bearish_premium) || 0,
          premium:
            (parseFloat(vol.call_premium) || 0) + (parseFloat(vol.put_premium) || 0),
          premiumRatio:
            parseFloat(vol.bullish_premium) > 0
              ? parseFloat(vol.bearish_premium) / parseFloat(vol.bullish_premium)
              : 1,
          tradeCount: 0,
          volume: (vol.call_volume ?? 0) + (vol.put_volume ?? 0),
        }
      : {
          bearishPremium: 0,
          bullishPremium: 0,
          premium: 0,
          premiumRatio: 1,
          tradeCount: 0,
          volume: 0,
        };

    const candidate: CandidateMeta = {
      ticker,
      entry,
      inCoilScreener: false,
      inFlowAlerts: false,
    };

    const analysis = await analyzeTicker(client, candidate);
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
