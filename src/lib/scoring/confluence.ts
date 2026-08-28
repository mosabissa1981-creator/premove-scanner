import { UnusualWhalesClient } from "@/lib/unusualwhales/client";
import type {
  CandidateMeta,
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
import { derivePhase } from "@/lib/scoring/phases";
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
  inFlowAlerts: boolean;
}): SignalDetail[] {
  const darkPoolElevated = input.darkPoolNotional > input.darkPoolBaseline * 1.5;
  const priceIsFlat = Math.abs(input.priceChangePct) < 3;
  const coilTight = input.coilScore >= 65;
  const bullishFlow = input.premiumRatio < 0.85 && input.premium >= 250_000;
  const ivRisingFlat =
    input.ivRank !== null && input.ivRank >= 55 && priceIsFlat;
  const approachingFlip =
    input.gexFlipDistance !== null && Math.abs(input.gexFlipDistance) <= 2;

  return [
    {
      id: "coil",
      label: "Price Coiling",
      phase: "accumulation",
      points: 2,
      triggered: coilTight && priceIsFlat,
      description: `Coil ${input.coilScore}/100, price ${input.priceChangePct.toFixed(1)}% — spring winding`,
    },
    {
      id: "darkpool",
      label: "Dark Pool Buildup",
      phase: "accumulation",
      points: 2,
      triggered: darkPoolElevated && priceIsFlat,
      description: darkPoolElevated
        ? `$${(input.darkPoolNotional / 1e6).toFixed(1)}M off-exchange while price flat`
        : `$${(input.darkPoolNotional / 1e6).toFixed(1)}M dark pool`,
    },
    {
      id: "flow",
      label: "Call Sweeps / Flow",
      phase: "conviction",
      points: 2,
      triggered: input.aggressiveFlow || input.inFlowAlerts || bullishFlow,
      description: input.inFlowAlerts
        ? "On today's unusual flow alerts"
        : input.aggressiveFlow
          ? "Sweep or large call flow detected"
          : bullishFlow
            ? "Bullish premium bias"
            : "No urgent flow yet",
    },
    {
      id: "iv",
      label: "IV Up, Price Flat",
      phase: "conviction",
      points: 1,
      triggered: ivRisingFlat,
      description:
        input.ivRank !== null
          ? `IV rank ${input.ivRank.toFixed(0)}% — market pricing a move`
          : "IV data unavailable",
    },
    {
      id: "technical",
      label: "At Breakout Level",
      phase: "ignition",
      points: 2,
      triggered: input.nearResistance,
      description: input.nearResistance
        ? "Within 2% of 10-day high — breakout zone"
        : "Not at resistance yet",
    },
    {
      id: "gex",
      label: "Near Gamma Flip",
      phase: "amplify",
      points: 1,
      triggered: approachingFlip,
      description:
        input.gexFlipDistance !== null
          ? `${input.gexFlipDistance.toFixed(1)}% from flip — move will accelerate`
          : "GEX flip level unavailable",
    },
    {
      id: "netflow",
      label: "Net Call Premium",
      phase: "conviction",
      points: 1,
      triggered: input.bullishNetFlow,
      description: input.bullishNetFlow
        ? "Calls dominating puts today"
        : "No net call bias",
    },
  ];
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

export async function discoverCandidates(
  client: UnusualWhalesClient,
  limit: number,
): Promise<CandidateMeta[]> {
  const [coilRes, flowRes] = await Promise.all([
    client.stockScreener({
      min_change: "-2",
      max_change: "2",
      min_net_call_premium: "250000",
      order: "net_call_premium",
      order_direction: "desc",
    }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
    client.flowAlerts({
      unusual: true,
      is_ask_side: true,
      min_premium: 100000,
      limit: 200,
    }) as Promise<UwDataResponse<UwFlowAlert[]>>,
  ]);

  const coilTickers = new Map<string, UwStockScreenerRow>();
  for (const row of coilRes.data ?? []) {
    coilTickers.set(row.ticker, row);
  }

  const flowTickers = new Map<string, UwFlowAlert>();
  for (const alert of flowRes.data ?? []) {
    if (!flowTickers.has(alert.ticker)) {
      flowTickers.set(alert.ticker, alert);
    }
  }

  const merged = new Map<string, CandidateMeta>();

  for (const [ticker, row] of coilTickers) {
    merged.set(ticker, {
      ticker,
      sector: row.sector,
      stockPrice: parseNum(row.close),
      entry: toVolumeEntry(row),
      inCoilScreener: true,
      inFlowAlerts: flowTickers.has(ticker),
    });
  }

  for (const [ticker, alert] of flowTickers) {
    const existing = merged.get(ticker);
    if (existing) {
      existing.inFlowAlerts = true;
      continue;
    }
    const price = parseNum(alert.underlying_price);
    merged.set(ticker, {
      ticker,
      stockPrice: price,
      entry: {
        bullishPremium: parseNum(alert.total_ask_side_prem),
        bearishPremium: parseNum(alert.total_bid_side_prem),
        premium: parseNum(alert.total_premium),
        premiumRatio: 0.5,
        tradeCount: 0,
        volume: 0,
      },
      inCoilScreener: false,
      inFlowAlerts: true,
    });
  }

  return [...merged.values()]
    .sort((a, b) => {
      const aBoost = (a.inCoilScreener ? 2 : 0) + (a.inFlowAlerts ? 3 : 0);
      const bBoost = (b.inCoilScreener ? 2 : 0) + (b.inFlowAlerts ? 3 : 0);
      if (bBoost !== aBoost) return bBoost - aBoost;
      return b.entry.premium - a.entry.premium;
    })
    .slice(0, limit);
}

export async function analyzeTicker(
  client: UnusualWhalesClient,
  candidate: CandidateMeta,
  darkPoolBaseline = 5_000_000,
): Promise<TickerAnalysis> {
  const { ticker, entry } = candidate;

  const [ohlcRes, darkRes, gexRes, ivRes] = await Promise.all([
    client.ohlc(ticker, "1d", 30) as Promise<UwDataResponse<UwCandle[]>>,
    client.darkpool(ticker, 5) as Promise<UwDataResponse<UwDarkpoolTrade[]>>,
    client.gexLevels(ticker) as Promise<UwDataResponse<UwGexLevels>>,
    client.ivRank(ticker) as Promise<UwDataResponse<UwIvRankRow[]>>,
  ]);

  let flowAlerts: UwFlowAlert[] = [];
  let info: UwStockInfo = {};
  let bullishNetFlow = false;

  try {
    const flowRes = (await client.tickerFlowAlerts(ticker, 15)) as UwDataResponse<UwFlowAlert[]>;
    flowAlerts = flowRes.data ?? [];
  } catch {
    flowAlerts = [];
  }

  try {
    const infoRes = (await client.stockInfo(ticker)) as UwDataResponse<UwStockInfo>;
    info = infoRes.data ?? {};
  } catch {
    info = {};
  }

  try {
    const volRes = (await client.optionsVolume(ticker)) as UwDataResponse<UwOptionsVolume[]>;
    if (volRes.data?.[0]) bullishNetFlow = hasBullishNetFlow(volRes.data[0]);
  } catch {
    bullishNetFlow = entry.bullishPremium > entry.bearishPremium;
  }

  const bars = toPriceBars(ohlcRes.data ?? []);
  const coilScore = calculateCoilScore(bars);
  const priceChangePct = calculatePriceChangePct(bars);
  const nearResistance = isNearResistance(bars);
  const darkPoolNotional = sumDarkPool(darkRes.data ?? []);
  const stockPrice =
    candidate.stockPrice ?? (bars.length > 0 ? bars[bars.length - 1].closePrice : 0);
  const gex = gexRes.data ? computeGexLevelsFromUw(gexRes.data, stockPrice) : null;
  const ivRank = computeIvRank(ivRes.data ?? []);
  const aggressiveFlow = hasAggressiveFlow(flowAlerts);

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
    inFlowAlerts: candidate.inFlowAlerts,
  });

  const score = signals.filter((s) => s.triggered).reduce((sum, s) => sum + s.points, 0);
  const maxScore = signals.reduce((sum, s) => sum + s.points, 0);
  const { phase, phaseLabel, action, tier } = derivePhase(signals);

  return {
    ticker,
    score,
    maxScore,
    tier,
    phase,
    phaseLabel,
    action,
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
    sector: candidate.sector ?? info.sector,
    companyName: info.full_name,
    stockPrice,
    inFlowAlerts: candidate.inFlowAlerts,
    inCoilScreener: candidate.inCoilScreener,
  };
}

export async function runConfluenceScan(
  client: UnusualWhalesClient,
  options: { limit?: number } = {},
): Promise<{
  results: TickerAnalysis[];
  candidatesScreened: number;
  errors: string[];
  strategy: string;
}> {
  const limit = options.limit ?? 12;
  const candidates = await discoverCandidates(client, limit);

  const results: TickerAnalysis[] = [];
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const analysis = await analyzeTicker(client, candidate);
      if (analysis.tier !== "watch" || analysis.score >= 3) {
        results.push(analysis);
      }
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      errors.push(`${candidate.ticker}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  const tierOrder = { ready: 0, "setting-up": 1, early: 2, watch: 3 };
  results.sort(
    (a, b) =>
      tierOrder[a.tier] - tierOrder[b.tier] ||
      b.score - a.score ||
      (b.inFlowAlerts && b.inCoilScreener ? 1 : 0) - (a.inFlowAlerts && a.inCoilScreener ? 1 : 0),
  );

  return {
    results,
    candidatesScreened: candidates.length,
    errors,
    strategy: "coil-first",
  };
}
