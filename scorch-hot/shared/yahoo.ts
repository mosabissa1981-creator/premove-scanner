export interface QuoteSlice {
  ticker: string;
  price: number;
  change1d: number;
  change1w: number;
  change1m: number;
  change3m: number;
  spark: number[];
}

export function pctChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

export function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export async function fetchYahooChart(symbol: string): Promise<QuoteSlice | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ScorchHot/1.0)",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number };
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };

  const result = json.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (closes.length < 5) return null;

  const price = result?.meta?.regularMarketPrice ?? closes[closes.length - 1];
  const last = closes[closes.length - 1];
  const d1 = closes[closes.length - 2] ?? last;
  const w1 = closes[Math.max(0, closes.length - 6)] ?? last;
  const m1 = closes[Math.max(0, closes.length - 22)] ?? last;
  const m3 = closes[0] ?? last;

  return {
    ticker: symbol,
    price: round(price, 2),
    change1d: round(pctChange(d1, last), 2),
    change1w: round(pctChange(w1, last), 2),
    change1m: round(pctChange(m1, last), 2),
    change3m: round(pctChange(m3, last), 2),
    spark: closes.slice(-21).map((v) => round(v, 2)),
  };
}

export async function fetchQuotes(symbols: string[]): Promise<Map<string, QuoteSlice>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out = new Map<string, QuoteSlice>();
  const batchSize = 8;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((sym) => fetchYahooChart(sym)));
    for (let j = 0; j < batch.length; j++) {
      const quote = results[j];
      if (quote) out.set(batch[j], quote);
    }
  }

  return out;
}
