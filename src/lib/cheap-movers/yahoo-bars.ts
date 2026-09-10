import { round } from "@/lib/scorch-hot/yahoo";
import type { PriceBar } from "@/lib/scoring/technical";

export interface CheapBarSeries {
  ticker: string;
  price: number;
  bars: PriceBar[];
  volumes: number[];
  companyName?: string;
}

/** Daily OHLCV from Yahoo Finance — free, no API key. */
export async function fetchYahooBars(symbol: string): Promise<CheapBarSeries | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=3mo&interval=1d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PreMoveCheap/1.0)",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          shortName?: string;
          longName?: string;
        };
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };

  const result = json.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!quote?.close?.length) return null;

  const bars: PriceBar[] = [];
  const volumes: number[] = [];

  for (let i = 0; i < quote.close.length; i++) {
    const close = quote.close[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const volume = quote.volume?.[i];
    if (
      typeof close !== "number" ||
      !Number.isFinite(close) ||
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number"
    ) {
      continue;
    }
    bars.push({
      openPrice: open,
      highPrice: high,
      lowPrice: low,
      closePrice: close,
    });
    volumes.push(typeof volume === "number" && Number.isFinite(volume) ? volume : 0);
  }

  if (bars.length < 15) return null;

  const price = result?.meta?.regularMarketPrice ?? bars[bars.length - 1].closePrice;
  return {
    ticker: symbol.toUpperCase(),
    price: round(price, price < 1 ? 4 : 2),
    bars,
    volumes,
    companyName: result?.meta?.longName ?? result?.meta?.shortName,
  };
}

export async function fetchYahooBarsBatch(
  symbols: string[],
  concurrency = 8,
): Promise<CheapBarSeries[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out: CheapBarSeries[] = [];

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((sym) => fetchYahooBars(sym)));
    for (const row of results) {
      if (row) out.push(row);
    }
  }

  return out;
}
