import { NextResponse } from "next/server";
import { parseCheapBand } from "@/lib/cheap-movers/universe";
import { runCheapScan } from "@/lib/cheap-movers/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Free under-$5 stock scan — Yahoo only, no API key, no options. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const band = parseCheapBand(searchParams.get("band"));
  const limit = Number(searchParams.get("limit") ?? "25");

  try {
    const result = await runCheapScan({
      band,
      limit: Math.min(Math.max(limit, 1), 50),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cheap scan failed" },
      { status: 500 },
    );
  }
}
