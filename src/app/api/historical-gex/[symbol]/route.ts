import { NextResponse } from "next/server";
import { fetchHistoricalGex } from "@/lib/db/historical-gex";
import { isDatabaseConfigured } from "@/lib/db/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "Symbol is required." }, { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ symbol: ticker, rows: [], configured: false });
  }

  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "15");
  const rows = await fetchHistoricalGex(ticker, Number.isFinite(days) ? days : 15);

  return NextResponse.json({
    symbol: ticker,
    rows,
    configured: true,
  });
}
