import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import {
  forwardReturnFromDate,
  summarizeBacktest,
  toDatedBars,
  type BacktestRow,
} from "@/lib/backtest/backtest";
import type {
  UwCandle,
  UwDataResponse,
  UwStockScreenerRow,
} from "@/lib/unusualwhales/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const apiKey = resolveApiKey(
    request.headers.get("x-uw-api-key"),
    cookieStore.get("uw_api_key")?.value,
  );
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";
  const horizon = Math.min(Math.max(Number(searchParams.get("horizon") ?? "10"), 1), 30);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "20"), 1), 40);

  if (!DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "Provide a valid date (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  try {
    const client = new UnusualWhalesClient(apiKey);

    const [callRes, oiRes] = await Promise.all([
      client.stockScreener({
        min_change: "-2",
        max_change: "2",
        min_net_call_premium: "250000",
        order: "net_call_premium",
        order_direction: "desc",
        date,
      }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
      client.stockScreener({
        min_change: "-3",
        max_change: "3",
        min_total_oi_change_perc: "5",
        order: "total_oi_change_perc",
        order_direction: "desc",
        date,
      }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
    ]);

    const picks = new Map<string, string>(); // ticker -> source
    for (const row of callRes.data ?? []) {
      if (!picks.has(row.ticker)) picks.set(row.ticker, "flat-call");
    }
    for (const row of oiRes.data ?? []) {
      if (!picks.has(row.ticker)) picks.set(row.ticker, "oi-change");
    }

    const entries = [...picks.entries()].slice(0, limit);
    const rows: BacktestRow[] = [];
    const errors: string[] = [];

    const CONCURRENCY = 4;
    let cursor = 0;
    async function worker() {
      while (cursor < entries.length) {
        const [ticker, source] = entries[cursor];
        cursor += 1;
        try {
          const ohlc = (await client.ohlc(ticker, "1d", 90)) as UwDataResponse<UwCandle[]>;
          const bars = toDatedBars(ohlc.data ?? []);
          const entryBar = bars.find((b) => b.date >= date);
          rows.push({
            ticker,
            source,
            entryClose: entryBar?.close ?? null,
            forwardReturn: forwardReturnFromDate(bars, date, horizon),
          });
        } catch (err) {
          errors.push(`${ticker}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker()),
    );

    return NextResponse.json({
      date,
      horizon,
      summary: summarizeBacktest(rows),
      rows: rows.sort((a, b) => (b.forwardReturn ?? -Infinity) - (a.forwardReturn ?? -Infinity)),
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backtest failed" },
      { status: 500 },
    );
  }
}
