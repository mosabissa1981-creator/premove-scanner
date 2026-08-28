import { QuantDataClient } from "@/lib/quantdata/client";
import type {
  DarkFlowResponse,
  GainersLosersEntry,
  GainersLosersResponse,
  IvRankResponse,
  MarketMapResponse,
  NetFlowResponse,
  OrderFlowResponse,
  SignalDetail,
  StockPriceResponse,
  TickerAnalysis,
} from "@/lib/quantdata/types";
import { computeGexLevels } from "@/lib/scoring/gex";
import {
  calculateCoilScore,
  calculatePriceChangePct,
  isNearResistance,
} from "@/lib/scoring/technical";
import type { ExposureByStrikeResponse } from "@/lib/quantdata/types";

function computeIvRank(iv: IvRankResponse): number | null {
  const dates = Object.keys(iv.data).sort();
  if (dates.length === 0) return null;
  const latest = iv.data[dates[dates.length - 1]];
  const call = latest.contractTypeToIVData.CALL;
  if (!call) return null;
  const range = call.windowMaxIv - call.windowMinIv;
  if (range <= 0) return null;
  return ((call.lastIv - call.windowMinIv) / range) * 100;
}

function sumDarkPool(flow: DarkFlowResponse): number {
  return Object.values(flow.data).reduce((sum, b) => sum + b.notionalValue, 0);
}

function hasAggressiveFlow(flow: OrderFlowResponse): boolean {
  const rows = Array.isArray(flow.data) ? flow.data : Object.values(flow.data);
  return rows.some((t) => {
    const premium = t.premium ?? 0;
    const type = (t.tradeType ?? "").toLowerCase();
    return premium >= 100_000 && (type.includes("sweep") || type.includes("block"));
  });
}

function hasBullishNetFlow(flow: NetFlowResponse): boolean {
  const buckets = Object.values(flow.data);
  if (buckets.length === 0) return false;
  const totals = buckets.reduce(
    (acc, b) => ({ calls: acc.calls + b.callSum, puts: acc.puts + b.putSum }),
    { calls: 0, puts: 0 },
  );
  return totals.calls > totals.puts * 1.2;
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
    input.gexFlipDistance !== null &&
    Math.abs(input.gexFlipDistance) <= 2;

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
          ? "Large sweep/block detected"
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
        ? "Intraday call premium exceeding puts"
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

export async function analyzeTicker(
  client: QuantDataClient,
  ticker: string,
  entry: GainersLosersEntry,
  market?: MarketMapResponse,
  darkPoolBaseline = 5_000_000,
): Promise<TickerAnalysis> {
  const [
    priceRes,
    darkRes,
    gexRes,
    ivRes,
    netFlowRes,
    orderFlowRes,
  ] = await Promise.all([
    client.stockPriceOverTime(ticker, 30) as Promise<StockPriceResponse>,
    client.darkFlow(ticker, 5) as Promise<DarkFlowResponse>,
    client.exposureByStrike(ticker) as Promise<ExposureByStrikeResponse>,
    client.ivRank(ticker) as Promise<IvRankResponse>,
    client.netFlow(ticker) as Promise<NetFlowResponse>,
    client.orderFlowConsolidated(ticker).catch(() => ({ data: [] })) as Promise<OrderFlowResponse>,
  ]);

  const bars = Object.values(priceRes.data);
  const coilScore = calculateCoilScore(bars);
  const priceChangePct = calculatePriceChangePct(bars);
  const nearResistance = isNearResistance(bars);
  const darkPoolNotional = sumDarkPool(darkRes);
  const gex = computeGexLevels(gexRes, ticker);
  const ivRank = computeIvRank(ivRes);
  const aggressiveFlow = hasAggressiveFlow(orderFlowRes);
  const bullishNetFlow = hasBullishNetFlow(netFlowRes);

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
  const marketEntry = market?.data[ticker];

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
    sector: marketEntry?.sector,
    companyName: marketEntry?.companyName,
    stockPrice: marketEntry?.currentValue ?? gex?.stockPrice,
  };
}

export async function runConfluenceScan(
  client: QuantDataClient,
  options: { limit?: number; minPremium?: number } = {},
): Promise<{ results: TickerAnalysis[]; candidatesScreened: number; errors: string[] }> {
  const limit = options.limit ?? 15;
  const minPremium = options.minPremium ?? 1_000_000;

  const [gainersRes, marketRes] = await Promise.all([
    client.gainersLosers({}) as Promise<GainersLosersResponse>,
    client.marketMap().catch(() => ({ data: {} })) as Promise<MarketMapResponse>,
  ]);

  const candidates = Object.entries(gainersRes.data)
    .filter(([, v]) => v.premium >= minPremium)
    .sort((a, b) => b[1].premium - a[1].premium)
    .slice(0, limit);

  const results: TickerAnalysis[] = [];
  const errors: string[] = [];

  for (const [ticker, entry] of candidates) {
    try {
      const analysis = await analyzeTicker(client, ticker, entry, marketRes);
      results.push(analysis);
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  results.sort((a, b) => b.score - a.score || b.premium - a.premium);

  return {
    results,
    candidatesScreened: candidates.length,
    errors,
  };
}
