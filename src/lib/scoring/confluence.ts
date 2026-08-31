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
import { fireProximityAlert } from "@/lib/alerts/webhook";
import { derivePhase } from "@/lib/scoring/phases";
import {
  calculateCoilMetrics,
  calculatePriceChangePct,
  getResistanceLevel,
  getSwingStop,
  isNearResistance,
  toPriceBars,
} from "@/lib/scoring/technical";
import { clamp01, gradedFactor, ramp } from "@/lib/scoring/util";
import { daysUntilEarnings, isEarningsSoon } from "@/lib/scoring/earnings";

function parseNum(value: string | number | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value) || 0;
}

function optionalNum(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function sumDarkPool(trades: UwDarkpoolTrade[]): number {
  return trades.reduce((sum, t) => sum + parseNum(t.premium), 0);
}

function computeIvRank(rows: UwIvRankRow[]): number | null {
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const rank = parseFloat(latest.iv_rank_1y);
  if (Number.isNaN(rank)) return null;
  // UW may return 0–1 or 0–100 depending on endpoint version
  return rank <= 1 ? rank * 100 : rank;
}

function relativeVolume(row: UwStockScreenerRow): number | null {
  const vol = optionalNum(row.volume);
  const avg = optionalNum(row.avg_30_day_volume);
  if (vol === null || avg === null || avg <= 0) return null;
  return vol / avg;
}

function hasAggressiveFlow(alerts: UwFlowAlert[]): boolean {
  return alerts.some((a) => {
    const premium = parseNum(a.total_premium);
    const isCall = a.type?.toLowerCase() === "call";
    return premium >= 100_000 && a.has_sweep && isCall;
  });
}

function darkPoolBaselineForPrice(stockPrice: number): number {
  if (stockPrice <= 0) return 5_000_000;
  // Scale baseline by price tier — avoids small caps always triggering
  if (stockPrice < 20) return 500_000;
  if (stockPrice < 50) return 1_500_000;
  if (stockPrice < 150) return 3_000_000;
  return 8_000_000;
}

function hasBullishNetFlow(vol: UwOptionsVolume): boolean {
  const netCall = parseNum(vol.net_call_premium);
  const netPut = parseNum(vol.net_put_premium);
  return netCall > netPut && netCall > 0;
}

export function buildSignals(input: {
  coilScore: number;
  coilBandWidthPct: number;
  darkPoolNotional: number;
  darkPoolBaseline: number;
  premiumRatio: number;
  premium: number;
  ivRank: number | null;
  priceChangePct: number;
  nearResistance: boolean;
  resistanceDistancePct: number | null;
  gexFlipDistance: number | null;
  aggressiveFlow: boolean;
  bullishNetFlow: boolean;
  inFlowAlerts: boolean;
  earningsSoon: boolean;
}): SignalDetail[] {
  const priceIsFlat = Math.abs(input.priceChangePct) < 3;
  const coilTight = input.coilScore >= 65;
  const darkPoolRatio =
    input.darkPoolBaseline > 0 ? input.darkPoolNotional / input.darkPoolBaseline : 0;
  const darkPoolElevated = darkPoolRatio > 1.5;
  const bullishFlow = input.premiumRatio < 0.85 && input.premium >= 250_000;
  const ivRisingFlat = input.ivRank !== null && input.ivRank >= 55 && priceIsFlat;
  const approachingFlip =
    input.gexFlipDistance !== null && Math.abs(input.gexFlipDistance) <= 2;

  const coilTriggered = coilTight && priceIsFlat;
  const coilStrength = coilTriggered ? gradedFactor(ramp(input.coilScore, 65, 90)) : 0;

  const darkTriggered = darkPoolElevated && priceIsFlat;
  const darkStrength = darkTriggered ? gradedFactor(ramp(darkPoolRatio, 1.5, 5)) : 0;

  const flowTriggered = input.aggressiveFlow || input.inFlowAlerts || bullishFlow;
  const flowStrength = flowTriggered
    ? input.aggressiveFlow
      ? 1
      : input.inFlowAlerts
        ? 0.8
        : 0.6
    : 0;

  const ivTriggered = ivRisingFlat;
  // Dampen the IV signal when earnings are imminent — the IV pop is usually
  // the event being priced, not organic accumulation.
  const ivStrengthBase =
    ivTriggered && input.ivRank !== null ? gradedFactor(ramp(input.ivRank, 55, 90)) : 0;
  const ivStrength = input.earningsSoon ? ivStrengthBase * 0.25 : ivStrengthBase;

  const techTriggered = input.nearResistance;
  const techStrength = techTriggered
    ? input.resistanceDistancePct !== null
      ? 0.5 + 0.5 * clamp01(1 - Math.abs(input.resistanceDistancePct) / 2)
      : 1
    : 0;

  const gexTriggered = approachingFlip;
  const gexStrength =
    gexTriggered && input.gexFlipDistance !== null
      ? 0.5 + 0.5 * clamp01(1 - Math.abs(input.gexFlipDistance) / 2)
      : 0;

  const netTriggered = input.bullishNetFlow;
  const netStrength = netTriggered ? 1 : 0;

  return [
    {
      id: "coil",
      label: "Price Coiling",
      phase: "accumulation",
      points: 2,
      triggered: coilTriggered,
      strength: coilStrength,
      description: `Coil ${input.coilScore}/100, ${input.coilBandWidthPct.toFixed(1)}% band width — spring winding`,
    },
    {
      id: "darkpool",
      label: "Dark Pool Buildup",
      phase: "accumulation",
      points: 2,
      triggered: darkTriggered,
      strength: darkStrength,
      description: darkTriggered
        ? `$${(input.darkPoolNotional / 1e6).toFixed(1)}M off-exchange while price flat (${darkPoolRatio.toFixed(1)}x baseline)`
        : `$${(input.darkPoolNotional / 1e6).toFixed(1)}M dark pool`,
    },
    {
      id: "flow",
      label: "Call Sweeps / Flow",
      phase: "conviction",
      points: 2,
      triggered: flowTriggered,
      strength: flowStrength,
      description: input.aggressiveFlow
        ? "Sweep or large call flow detected"
        : input.inFlowAlerts
          ? "On today's unusual flow alerts"
          : bullishFlow
            ? "Bullish premium bias"
            : "No urgent flow yet",
    },
    {
      id: "iv",
      label: "IV Up, Price Flat",
      phase: "conviction",
      points: 1,
      triggered: ivTriggered,
      strength: ivStrength,
      description:
        input.ivRank === null
          ? "IV data unavailable"
          : input.earningsSoon
            ? `IV rank ${input.ivRank.toFixed(0)}% — but earnings soon, likely event IV`
            : `IV rank ${input.ivRank.toFixed(0)}% — market pricing a move`,
    },
    {
      id: "technical",
      label: "At Breakout Level",
      phase: "ignition",
      points: 2,
      triggered: techTriggered,
      strength: techStrength,
      description: techTriggered
        ? "Within 2% of 10-day high — breakout zone"
        : "Not at resistance yet",
    },
    {
      id: "gex",
      label: "Near Gamma Flip",
      phase: "amplify",
      points: 1,
      triggered: gexTriggered,
      strength: gexStrength,
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
      triggered: netTriggered,
      strength: netStrength,
      description: netTriggered ? "Calls dominating puts today" : "No net call bias",
    },
  ];
}

/** Graded score (0..maxScore) and its percentage, using per-signal strength. */
export function scoreSignals(signals: SignalDetail[]): {
  score: number;
  maxScore: number;
  scorePct: number;
} {
  const maxScore = signals.reduce((sum, s) => sum + s.points, 0);
  const raw = signals.reduce(
    (sum, s) => sum + (s.triggered ? s.points * clamp01(s.strength) : 0),
    0,
  );
  return {
    score: Math.round(raw * 10) / 10,
    maxScore,
    scorePct: maxScore > 0 ? Math.round((raw / maxScore) * 100) : 0,
  };
}

export const EMPTY_OPTIONS_VOLUME_ENTRY: OptionsVolumeEntry = {
  bearishPremium: 0,
  bullishPremium: 0,
  premium: 0,
  premiumRatio: 1,
  tradeCount: 0,
  volume: 0,
};

export function optionsVolumeToEntry(row: UwStockScreenerRow | UwOptionsVolume): OptionsVolumeEntry {
  return toVolumeEntry(row);
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

function screenerToCandidate(row: UwStockScreenerRow, source: string): CandidateMeta {
  return {
    ticker: row.ticker,
    sector: row.sector,
    stockPrice: parseNum(row.close),
    entry: toVolumeEntry(row),
    inCoilScreener: true,
    inFlowAlerts: false,
    sources: [source],
    nextEarnings: row.next_earnings_date ?? null,
    oiChangePerc: optionalNum(row.total_oi_change_perc),
    relativeVolume: relativeVolume(row),
    week52High: optionalNum(row.week_52_high),
  };
}

function screenerRowForTicker(
  rows: UwStockScreenerRow[] | undefined,
  ticker: string,
): UwStockScreenerRow | undefined {
  const upper = ticker.toUpperCase();
  return rows?.find((row) => row.ticker.toUpperCase() === upper);
}

function candidateFromFlowAlert(alert: UwFlowAlert, sources: string[] = ["flow"]): CandidateMeta {
  const price = parseNum(alert.underlying_price);
  const ask = parseNum(alert.total_ask_side_prem);
  const bid = parseNum(alert.total_bid_side_prem);
  const bullish = ask > bid ? ask : parseNum(alert.total_premium) * 0.6;
  const bearish = bid > 0 ? bid : parseNum(alert.total_premium) * 0.4;

  return {
    ticker: alert.ticker.toUpperCase(),
    stockPrice: price,
    entry: {
      bullishPremium: bullish,
      bearishPremium: bearish,
      premium: parseNum(alert.total_premium),
      premiumRatio: bullish > 0 ? bearish / bullish : 1,
      tradeCount: 0,
      volume: 0,
    },
    inCoilScreener: false,
    inFlowAlerts: true,
    sources,
    nextEarnings: null,
    oiChangePerc: null,
    relativeVolume: null,
    week52High: null,
  };
}

/**
 * Resolve discovery metadata for one ticker using the same UW screener buckets
 * and flow thresholds as `discoverCandidates`, so deep-dive analysis matches scan cards.
 */
export async function resolveCandidateForTicker(
  client: UnusualWhalesClient,
  ticker: string,
  opts: { date?: string } = {},
): Promise<CandidateMeta> {
  const upper = ticker.toUpperCase();
  const { date } = opts;

  const [flatCallRes, oiChangeRes, flowRes, volRes, overviewRes] = await Promise.all([
    client.stockScreener({
      ticker: upper,
      min_change: "-2",
      max_change: "2",
      min_net_call_premium: "250000",
      date,
    }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
    client.stockScreener({
      ticker: upper,
      min_change: "-3",
      max_change: "3",
      min_total_oi_change_perc: "5",
      date,
    }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
    client.tickerFlowAlerts(upper, 15) as Promise<UwDataResponse<UwFlowAlert[]>>,
    client.optionsVolume(upper) as Promise<UwDataResponse<UwOptionsVolume[]>>,
    client.stockScreener({ ticker: upper, date }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
  ]);

  const sources: string[] = [];
  if (screenerRowForTicker(flatCallRes.data, upper)) sources.push("flat-call");
  if (screenerRowForTicker(oiChangeRes.data, upper)) sources.push("oi-change");

  const flowAlerts = flowRes.data ?? [];
  const inFlowAlerts = flowAlerts.some((a) => parseNum(a.total_premium) >= 100_000);
  if (inFlowAlerts) sources.push("flow");

  const row =
    screenerRowForTicker(flatCallRes.data, upper) ??
    screenerRowForTicker(oiChangeRes.data, upper) ??
    screenerRowForTicker(overviewRes.data, upper);

  const vol = volRes.data?.[0];
  if (vol) {
    return {
      ticker: upper,
      sector: row?.sector,
      stockPrice: row ? parseNum(row.close) : undefined,
      entry: toVolumeEntry(vol),
      inCoilScreener: sources.includes("flat-call") || sources.includes("oi-change"),
      inFlowAlerts,
      sources: sources.length ? sources : undefined,
      nextEarnings: row?.next_earnings_date ?? null,
      oiChangePerc: row ? optionalNum(row.total_oi_change_perc) : null,
      relativeVolume: row ? relativeVolume(row) : null,
      week52High: row ? optionalNum(row.week_52_high) : null,
    };
  }

  if (row) {
    return {
      ...screenerToCandidate(row, sources[0] ?? "overview"),
      inFlowAlerts,
      sources: sources.length ? sources : ["overview"],
      inCoilScreener: sources.includes("flat-call") || sources.includes("oi-change"),
    };
  }

  if (inFlowAlerts && flowAlerts[0]) {
    return candidateFromFlowAlert(flowAlerts[0], sources);
  }

  return {
    ticker: upper,
    entry: EMPTY_OPTIONS_VOLUME_ENTRY,
    inCoilScreener: false,
    inFlowAlerts: false,
  };
}

/** Single-ticker entry point — same candidate resolution + analysis as the landing scan. */
export async function runTickerAnalysis(
  client: UnusualWhalesClient,
  ticker: string,
  opts: { date?: string } = {},
): Promise<TickerAnalysis> {
  const candidate = await resolveCandidateForTicker(client, ticker, opts);
  return analyzeTicker(client, candidate);
}

/** Discovery rank — how promising a candidate is before deep analysis. */
export function discoveryRank(c: CandidateMeta): number {
  let r = 0;
  r += (c.sources?.length ?? 1) * 3;
  if (c.inFlowAlerts) r += 3;
  if (c.inCoilScreener) r += 2;
  r += clamp01((c.oiChangePerc ?? 0) / 20) * 3;
  r += clamp01((c.relativeVolume ?? 0) / 3) * 2;
  return r;
}

export async function discoverCandidates(
  client: UnusualWhalesClient,
  limit: number,
  opts: { date?: string } = {},
): Promise<CandidateMeta[]> {
  const { date } = opts;

  const [flatCallRes, oiChangeRes, flowRes] = await Promise.all([
    // Bucket A: flat price + strong net call premium (hidden bullish flow).
    client.stockScreener({
      min_change: "-2",
      max_change: "2",
      min_net_call_premium: "250000",
      order: "net_call_premium",
      order_direction: "desc",
      date,
    }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
    // Bucket B: flat price + rising open interest (quiet positioning that raw
    // premium screens miss — closer to the "before the move" thesis).
    client.stockScreener({
      min_change: "-3",
      max_change: "3",
      min_total_oi_change_perc: "5",
      order: "total_oi_change_perc",
      order_direction: "desc",
      date,
    }) as Promise<UwDataResponse<UwStockScreenerRow[]>>,
    client.flowAlerts({
      unusual: true,
      is_ask_side: true,
      min_premium: 100000,
      limit: 200,
    }) as Promise<UwDataResponse<UwFlowAlert[]>>,
  ]);

  const merged = new Map<string, CandidateMeta>();

  function mergeScreenerRow(row: UwStockScreenerRow, source: string) {
    const existing = merged.get(row.ticker);
    if (existing) {
      existing.sources = existing.sources ?? [];
      if (!existing.sources.includes(source)) existing.sources.push(source);
      existing.inCoilScreener = true;
      existing.nextEarnings = existing.nextEarnings ?? (row.next_earnings_date ?? null);
      existing.oiChangePerc = existing.oiChangePerc ?? optionalNum(row.total_oi_change_perc);
      existing.relativeVolume = existing.relativeVolume ?? relativeVolume(row);
      existing.week52High = existing.week52High ?? optionalNum(row.week_52_high);
      return;
    }
    merged.set(row.ticker, screenerToCandidate(row, source));
  }

  for (const row of flatCallRes.data ?? []) mergeScreenerRow(row, "flat-call");
  for (const row of oiChangeRes.data ?? []) mergeScreenerRow(row, "oi-change");

  const flowTickers = new Set<string>();
  for (const alert of flowRes.data ?? []) {
    if (flowTickers.has(alert.ticker)) continue;
    flowTickers.add(alert.ticker);

    const existing = merged.get(alert.ticker);
    if (existing) {
      existing.inFlowAlerts = true;
      existing.sources = existing.sources ?? [];
      if (!existing.sources.includes("flow")) existing.sources.push("flow");
      continue;
    }

    merged.set(alert.ticker, candidateFromFlowAlert(alert));
  }

  return [...merged.values()]
    .sort((a, b) => {
      const rank = discoveryRank(b) - discoveryRank(a);
      if (rank !== 0) return rank;
      return b.entry.premium - a.entry.premium;
    })
    .slice(0, limit);
}

export async function analyzeTicker(
  client: UnusualWhalesClient,
  candidate: CandidateMeta,
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
  const { score: coilScore, bandWidthPct: coilBandWidthPct } = calculateCoilMetrics(bars);
  const priceChangePct = calculatePriceChangePct(bars);
  const nearResistance = isNearResistance(bars);
  const resistanceLevel = getResistanceLevel(bars);
  const stopLevel = getSwingStop(bars);
  const darkPoolNotional = sumDarkPool(darkRes.data ?? []);
  const stockPrice =
    candidate.stockPrice ?? (bars.length > 0 ? bars[bars.length - 1].closePrice : 0);
  const darkPoolBaseline = darkPoolBaselineForPrice(stockPrice);
  const gex = gexRes.data ? computeGexLevelsFromUw(gexRes.data, stockPrice) : null;
  const ivRank = computeIvRank(ivRes.data ?? []);
  const aggressiveFlow = hasAggressiveFlow(flowAlerts);
  const inFlowAlerts =
    candidate.inFlowAlerts ||
    flowAlerts.some((a) => parseNum(a.total_premium) >= 100_000);
  const inCoilScreener =
    candidate.inCoilScreener || (coilScore >= 65 && Math.abs(priceChangePct) < 3);

  const earningsInDays = daysUntilEarnings(candidate.nextEarnings ?? null);
  const earningsSoon = isEarningsSoon(earningsInDays);

  const resistanceDistancePct =
    resistanceLevel && resistanceLevel > 0 && stockPrice > 0
      ? ((resistanceLevel - stockPrice) / resistanceLevel) * 100
      : null;

  const signals = buildSignals({
    coilScore,
    coilBandWidthPct,
    darkPoolNotional,
    darkPoolBaseline,
    premiumRatio: entry.premiumRatio,
    premium: entry.premium,
    ivRank,
    priceChangePct,
    nearResistance,
    resistanceDistancePct,
    gexFlipDistance: gex?.flipDistancePct ?? null,
    aggressiveFlow,
    bullishNetFlow,
    inFlowAlerts,
    earningsSoon,
  });

  const { score, maxScore, scorePct } = scoreSignals(signals);
  const { phase, phaseLabel, action, holdTime, tier } = derivePhase(signals);

  return {
    ticker,
    score,
    maxScore,
    scorePct,
    tier,
    phase,
    phaseLabel,
    action,
    holdTime,
    resistanceLevel,
    stopLevel,
    earningsInDays,
    earningsSoon,
    oiChangePerc: candidate.oiChangePerc ?? null,
    relativeVolume: candidate.relativeVolume ?? null,
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
    inFlowAlerts,
    inCoilScreener,
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
  const limit = options.limit ?? 25;
  const candidates = await discoverCandidates(client, limit);

  const results: TickerAnalysis[] = [];
  const errors: string[] = [];

  // Analyze candidates with bounded concurrency instead of one-at-a-time with a
  // fixed delay. Each ticker fans out several UW calls, so a small pool keeps
  // scan latency low while the client's cache + retry/backoff absorb bursts and
  // stay within rate limits.
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor];
      cursor += 1;
      try {
        const analysis = await analyzeTicker(client, candidate);
        if (analysis.tier !== "watch" || analysis.score >= 3) {
          results.push(analysis);
        }
      } catch (err) {
        errors.push(
          `${candidate.ticker}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()),
  );

  const tierOrder = { ready: 0, "setting-up": 1, early: 2, watch: 3 };
  results.sort(
    (a, b) =>
      tierOrder[a.tier] - tierOrder[b.tier] ||
      b.score - a.score ||
      (b.inFlowAlerts && b.inCoilScreener ? 1 : 0) - (a.inFlowAlerts && a.inCoilScreener ? 1 : 0),
  );

  for (const analysis of results) {
    if (analysis.tier !== "ready") continue;
    fireProximityAlert({
      ticker: analysis.ticker,
      scorePct: analysis.scorePct,
      spotPrice: analysis.stockPrice ?? analysis.gex?.stockPrice,
      gammaFlip: analysis.gex?.gammaFlip,
      putWall: analysis.gex?.putWall,
      callWall: analysis.gex?.callWall,
    });
  }

  return {
    results,
    candidatesScreened: candidates.length,
    errors,
    strategy: "multi-bucket-graded",
  };
}
