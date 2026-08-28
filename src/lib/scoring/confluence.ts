import { UnusualWhalesClient } from "@/lib/unusualwhales/client";
import type {
  OptionsVolumeEntry,
  SignalDetail,
  TickerAnalysis,
  UwCandle,
  UwDarkpoolTrade,
  UwDataResponse,
  UwFlowAlert,
  UwGexLevels,
  UwIvRankRow,
  UwOptionsVolume,
  UwStockInfo,
  UwStockScreenerRow,
} from "@/lib/unusualwhales/types";
import { computeGexLevelsFromUw } from "@/lib/scoring/gex";
import {
  calculateCoilScore,
  calculatePriceChangePct,
  isNearResistance,
  toPriceBars,
} from "@/lib/scoring/technical";

function parseNum(value: string | number | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value) || 0;
}

function sumDarkPool(trades: UwDarkpoolTrade[]): number {
  return trades.reduce((sum, t) => sum + parseNum(t.premium), 0);
}

function computeIvRank(rows: UwIvRankRow[]): number | null {
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const rank = parseFloat(latest.iv_rank_1y);
  return Number.isNaN(rank) ? null : rank * 100;
}

function hasAggressiveFlow(alerts: UwFlowAlert[]): boolean {
  return alerts.some((a) => {
    const premium = parseNum(a.total_premium);
    const isCall = a.type?.toLowerCase() === "call";
    return premium >= 100_000 && (a.has_sweep || isCall);
  });
}

function hasBullishNetFlow(vol: UwOptionsVolume): boolean {
  const netCall = parseNum(vol.net_call_premium);
  const netPut = parseNum(vol.net_put_premium);
  return netCall > netPut && netCall > 0;
}

function buildSignals(input: {
  coilScore: number;
  darkPoolNotional: number;
  darkPoolBaseline: number;
  premiumRatio: number;
  premium: number;
  ivRank: number | null;
  priceChangePct: number;
  nearResistance: boolean;
  gexFlipDistance: number | null;
  aggressiveFlow: boolean;
  bullishNetFlow: boolean;
}): SignalDetail[] {
  const darkPoolElevated = input.darkPoolNotional > input.darkPoolBaseline * 1.5;
  const bullishFlow = input.premiumRatio < 0.85 && input.premium >= 500_000;
  const ivRisingFlat =
    input.ivRank !== null && input.ivRank >= 60 && Math.abs(input.priceChangePct) < 3;
  const approachingFlip =
    input.gexFlipDistance !== null && Math.abs(input.gexFlipDistance) <= 2;

  return [
    {
      id: "coil",
      label: "Volatility Coil",
      points: 1,
      triggered: input.coilScore >= 70,
      description: `CoilScore ${input.coilScore}/100 — price range compressing`,
    },
    {
      id: "darkpool",
      label: "Dark Pool Accumulation",
      points: 1,
      triggered: darkPoolElevated,
      description: darkPoolElevated
        ? `Dark pool $${(input.darkPoolNotional / 1e6).toFixed(1)}M (elevated)`
        : `Dark pool $${(input.darkPoolNotional / 1e6).toFixed(1)}M (normal)`,
    },
    {
      id: "flow",
      label: "Bullish Options Flow",
      points: 2,
      triggered: bullishFlow || input.aggressiveFlow,
      description: bullishFlow
        ? `Premium ratio ${input.premiumRatio.toFixed(2)} — more call premium`
        : input.aggressiveFlow
          ? "Sweep or large call flow detected"
          : `Premium ratio ${input.premiumRatio.toFixed(2)}`,
    },
    {
      id: "iv",
      label: "IV Rising, Price Flat",
      points: 1,
      triggered: ivRisingFlat,
      description:
        input.ivRank !== null
          ? `IV rank ${input.ivRank.toFixed(0)}% with ${input.priceChangePct.toFixed(1)}% price move`
          : "IV data unavailable",
    },
    {
      id: "technical",
      label: "Near Resistance",
      points: 1,
      triggered: input.nearResistance,
      description: input.nearResistance
        ? "Price within 2% of 10-day high"
        : "Not at breakout level yet",
    },
    {
      id: "gex",
      label: "GEX Flip Proximity",
      points: 1,
      triggered: approachingFlip,
      description:
        input.gexFlipDistance !== null
          ? `${input.gexFlipDistance.toFixed(1)}% from gamma flip`
          : "Gamma flip level unavailable",
    },
    {
      id: "netflow",
      label: "Net Call Premium",
      points: 1,
      triggered: input.bullishNetFlow,
      description: input.bullishNetFlow
        ? "Net call premium exceeds puts"
        : "No clear net call bias",
    },
  ];
}

function scoreTier(score: number): TickerAnalysis["tier"] {
  if (score >= 6) return "high";
  if (score >= 4) return "medium";
  if (score >= 2) return "watch";
  return "low";
}

function toVolumeEntry(row: UwStockScreenerRow | UwOptionsVolume): OptionsVolumeEntry {
  const bullish = parseNum(row.bullish_premium);
  const bearish = parseNum(row.bearish_premium);
  const callPrem = parseNum("call_premium" in row ? row.call_premium : 0);
  const putPrem = parseNum("put_premium" in row ? row.put_premium : 0);
  const premium = callPrem + putPrem || bullish + bearish;
  const volume =
    "call_volume" in row ? (row.call_volume ?? 0) + (row.put_volume ?? 0) : 0;

  return {
    bullishPremium: bullish,
    bearishPremium: bearish,
    premium,
    premiumRatio: bullish > 0 ? bearish / bullish : 1,
    tradeCount: 0,
    volume,
  };
}

export async function analyzeTicker(
  client: UnusualWhalesClient,
  ticker: string,
  entry: OptionsVolumeEntry,
  meta?: { sector?: string; companyName?: string; stockPrice?: number },
  darkPoolBaseline = 5_000_000,
): Promise<TickerAnalysis> {
  const ohlcRes = (await client.ohlc(ticker, "1d", 30)) as UwDataResponse<UwCandle[]>;
  const darkRes = (await client.darkpool(ticker, 5)) as UwDataResponse<UwDarkpoolTrade[]>;
  const gexRes = (await client.gexLevels(ticker)) as UwDataResponse<UwGexLevels>;
  const ivRes = (await client.ivRank(ticker)) as UwDataResponse<UwIvRankRow[]>;

  let flowAlerts: UwFlowAlert[] = [];
  try {
    const flowRes = (await client.tickerFlowAlerts(ticker, 25)) as UwDataResponse<UwFlowAlert[]>;
    flowAlerts = flowRes.data ?? [];
  } catch {
    flowAlerts = [];
  }

  let info: UwStockInfo = {};
  try {
    const infoRes = (await client.stockInfo(ticker)) as UwDataResponse<UwStockInfo>;
    info = infoRes.data ?? {};
  } catch {
    info = {};
  }

  const bars = toPriceBars(ohlcRes.data ?? []);
  const coilScore = calculateCoilScore(bars);
  const priceChangePct = calculatePriceChangePct(bars);
  const nearResistance = isNearResistance(bars);
  const darkPoolNotional = sumDarkPool(darkRes.data ?? []);
  const stockPrice =
    meta?.stockPrice ??
    (bars.length > 0 ? bars[bars.length - 1].closePrice : 0);
  const gex = gexRes.data
    ? computeGexLevelsFromUw(gexRes.data, stockPrice)
    : null;
  const ivRank = computeIvRank(ivRes.data ?? []);
  const aggressiveFlow = hasAggressiveFlow(flowAlerts);

  let bullishNetFlow = false;
  try {
    const volRes = (await client.optionsVolume(ticker)) as UwDataResponse<UwOptionsVolume[]>;
    if (volRes.data?.[0]) bullishNetFlow = hasBullishNetFlow(volRes.data[0]);
  } catch {
    bullishNetFlow = parseNum(entry.bullishPremium) > parseNum(entry.bearishPremium);
  }

  const signals = buildSignals({
    coilScore,
    darkPoolNotional,
    darkPoolBaseline,
    premiumRatio: entry.premiumRatio,
    premium: entry.premium,
    ivRank,
    priceChangePct,
    nearResistance,
    gexFlipDistance: gex?.flipDistancePct ?? null,
    aggressiveFlow,
    bullishNetFlow,
  });

  const score = signals.filter((s) => s.triggered).reduce((sum, s) => sum + s.points, 0);
  const maxScore = signals.reduce((sum, s) => sum + s.points, 0);

  return {
    ticker,
    score,
    maxScore,
    tier: scoreTier(score),
    signals,
    gex,
    premium: entry.premium,
    bullishPremium: entry.bullishPremium,
    bearishPremium: entry.bearishPremium,
    premiumRatio: entry.premiumRatio,
    darkPoolNotional,
    coilScore,
    ivRank,
    priceChangePct,
    sector: meta?.sector ?? info.sector,
    companyName: meta?.companyName ?? info.full_name,
    stockPrice,
  };
}

export async function runConfluenceScan(
  client: UnusualWhalesClient,
  options: { limit?: number; minPremium?: number } = {},
): Promise<{ results: TickerAnalysis[]; candidatesScreened: number; errors: string[] }> {
  const limit = options.limit ?? 15;
  const minPremium = options.minPremium ?? 1_000_000;

  const screenerRes = (await client.stockScreener({
    min_premium: String(minPremium),
    order: "call_premium",
    order_direction: "desc",
  })) as UwDataResponse<UwStockScreenerRow[]>;

  const candidates = (screenerRes.data ?? [])
    .filter((row) => parseNum(row.call_premium) + parseNum(row.put_premium) >= minPremium)
    .slice(0, limit);

  const results: TickerAnalysis[] = [];
  const errors: string[] = [];

  for (const row of candidates) {
    try {
      const entry = toVolumeEntry(row);
      const analysis = await analyzeTicker(client, row.ticker, entry, {
        sector: row.sector,
        stockPrice: parseNum(row.close),
      });
      results.push(analysis);
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      errors.push(`${row.ticker}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  results.sort((a, b) => b.score - a.score || b.premium - a.premium);

  return {
    results,
    candidatesScreened: candidates.length,
    errors,
  };
}
