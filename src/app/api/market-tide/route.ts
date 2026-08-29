import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { interpretMarketTide } from "@/lib/scoring/market-tide";
import type { UwDataResponse, UwMarketTideRow } from "@/lib/unusualwhales/types";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const apiKey = resolveApiKey(
    request.headers.get("x-uw-api-key"),
    cookieStore.get("uw_api_key")?.value,
  );

  // No key: the banner simply hides rather than erroring.
  if (!apiKey) {
    return NextResponse.json({ available: false });
  }

  try {
    const client = new UnusualWhalesClient(apiKey);
    const res = (await client.marketTide()) as UwDataResponse<UwMarketTideRow[]>;
    const view = interpretMarketTide(res.data ?? []);
    if (!view) return NextResponse.json({ available: false });
    return NextResponse.json({ available: true, ...view });
  } catch {
    return NextResponse.json({ available: false });
  }
}
