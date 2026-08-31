import type { UnusualWhalesClient } from "@/lib/unusualwhales/client";
import { discoverCandidates } from "@/lib/scoring/confluence";
import { fetchGexStudy } from "@/lib/gex-study/gex-study";
import { upsertHistoricalGex } from "@/lib/db/historical-gex";

export interface SaveGexResult {
  date: string;
  saved: string[];
  skipped: string[];
  errors: string[];
}

export async function saveDailyGexSnapshots(
  client: UnusualWhalesClient,
  options: { limit?: number; date?: string } = {},
): Promise<SaveGexResult> {
  const limit = options.limit ?? 25;
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const candidates = await discoverCandidates(client, limit, { date });
  const tickers = [...new Set(candidates.map((candidate) => candidate.ticker.toUpperCase()))];

  const saved: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const ticker of tickers) {
    try {
      const study = await fetchGexStudy(client, ticker, "weekly");
      if (study.stockPrice == null) {
        skipped.push(ticker);
        continue;
      }

      await upsertHistoricalGex({
        symbol: ticker,
        date,
        gammaFlip: study.gammaFlip,
        putWall: study.putWall,
        callWall: study.callWall,
        spotPrice: study.stockPrice,
      });
      saved.push(ticker);
    } catch (err) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return { date, saved, skipped, errors };
}
