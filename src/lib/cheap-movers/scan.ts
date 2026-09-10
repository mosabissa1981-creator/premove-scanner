import {
  CHEAP_STOCK_UNIVERSE,
  parseCheapBand,
  priceInBand,
  type CheapBand,
} from "@/lib/cheap-movers/universe";
import { fetchYahooBarsBatch } from "@/lib/cheap-movers/yahoo-bars";
import {
  compareCheapSetups,
  scoreCheapSeries,
  type CheapSetup,
} from "@/lib/cheap-movers/score";

export type { CheapSetup, CheapBand };

export interface CheapScanResult {
  scannedAt: string;
  band: CheapBand;
  candidatesScreened: number;
  pricedInBand: number;
  results: CheapSetup[];
  errors: string[];
  strategy: string;
  source: "yahoo-free";
}

export async function runCheapScan(
  options: {
    band?: CheapBand | string;
    limit?: number;
    symbols?: string[];
  } = {},
): Promise<CheapScanResult> {
  const band =
    typeof options.band === "string" ? parseCheapBand(options.band) : (options.band ?? "all");
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
  const symbols = options.symbols?.length ? options.symbols : CHEAP_STOCK_UNIVERSE;

  const series = await fetchYahooBarsBatch(symbols, 8);
  const errors: string[] = [];
  const pricedInBand = series.filter((row) => priceInBand(row.price, band));

  const results: CheapSetup[] = [];
  for (const row of pricedInBand) {
    try {
      const setup = scoreCheapSeries({
        ticker: row.ticker,
        companyName: row.companyName,
        stockPrice: row.price,
        bars: row.bars,
        volumes: row.volumes,
      });
      if (setup) results.push(setup);
    } catch (err) {
      errors.push(`${row.ticker}: ${err instanceof Error ? err.message : "score failed"}`);
    }
  }

  results.sort(compareCheapSetups);

  return {
    scannedAt: new Date().toISOString(),
    band,
    candidatesScreened: symbols.length,
    pricedInBand: pricedInBand.length,
    results: results.slice(0, limit),
    errors,
    strategy: "cheap-yahoo-coil-volume-v1",
    source: "yahoo-free",
  };
}
