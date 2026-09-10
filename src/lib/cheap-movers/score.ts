import {
  calculateCoilMetrics,
  calculatePriceChangePct,
  getResistanceLevel,
  getSwingStop,
  isNearResistance,
  type PriceBar,
} from "@/lib/scoring/technical";
import { clamp01, gradedFactor, ramp } from "@/lib/scoring/util";

export type CheapTier = "ready" | "setting-up" | "early" | "watch";

export interface CheapSignal {
  id: string;
  label: string;
  triggered: boolean;
  strength: number;
  description: string;
}

export interface CheapSetup {
  ticker: string;
  companyName?: string;
  stockPrice: number;
  score: number;
  maxScore: number;
  scorePct: number;
  tier: CheapTier;
  tierLabel: string;
  action: string;
  coilScore: number;
  bandWidthPct: number;
  priceChangePct: number;
  change1dPct: number;
  relativeVolume: number | null;
  nearResistance: boolean;
  resistanceLevel: number | null;
  stopLevel: number | null;
  signals: CheapSignal[];
  band: "under1" | "oneToFive";
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Latest day volume vs prior 20-day average. */
export function calcRelativeVolume(volumes: number[]): number | null {
  if (volumes.length < 6) return null;
  const latest = volumes[volumes.length - 1];
  const prior = volumes.slice(-21, -1);
  const baseline = average(prior.filter((v) => v > 0));
  if (baseline <= 0) return null;
  return latest / baseline;
}

export function calcChange1dPct(bars: PriceBar[]): number {
  if (bars.length < 2) return 0;
  const prev = bars[bars.length - 2].closePrice;
  const last = bars[bars.length - 1].closePrice;
  if (prev === 0) return 0;
  return ((last - prev) / prev) * 100;
}

export function buildCheapSignals(input: {
  coilScore: number;
  bandWidthPct: number;
  priceChangePct: number;
  change1dPct: number;
  relativeVolume: number | null;
  nearResistance: boolean;
}): CheapSignal[] {
  const priceQuiet = Math.abs(input.priceChangePct) < 12;
  const notSpiking = Math.abs(input.change1dPct) < 8;
  const coilTight = input.coilScore >= 60;
  const rvol = input.relativeVolume ?? 0;
  const volumeHeat = rvol >= 1.5;
  const volumeSurge = rvol >= 2.5;

  const coilTriggered = coilTight && priceQuiet;
  const coilStrength = coilTriggered ? gradedFactor(ramp(input.coilScore, 60, 90)) : 0;

  const volTriggered = volumeHeat && notSpiking;
  const volStrength = volTriggered
    ? volumeSurge
      ? 1
      : gradedFactor(ramp(rvol, 1.5, 4))
    : 0;

  const techTriggered = input.nearResistance && notSpiking;
  const techStrength = techTriggered ? 1 : 0;

  const baseTriggered = priceQuiet && Math.abs(input.priceChangePct) < 6;
  const baseStrength = baseTriggered
    ? gradedFactor(1 - clamp01(Math.abs(input.priceChangePct) / 6))
    : 0;

  return [
    {
      id: "coil",
      label: "Price Coiling",
      triggered: coilTriggered,
      strength: coilStrength,
      description: `Coil ${input.coilScore}/100 · ${input.bandWidthPct.toFixed(1)}% band — spring winding`,
    },
    {
      id: "volume",
      label: "Volume Heat",
      triggered: volTriggered,
      strength: volStrength,
      description:
        input.relativeVolume === null
          ? "Volume data unavailable"
          : volumeHeat
            ? `${input.relativeVolume.toFixed(1)}× average volume while price calm`
            : `${input.relativeVolume.toFixed(1)}× average volume — not hot yet`,
    },
    {
      id: "breakout",
      label: "Near Breakout",
      triggered: techTriggered,
      strength: techStrength,
      description: techTriggered
        ? "Within 2% of recent high — breakout zone"
        : "Not pressing resistance yet",
    },
    {
      id: "base",
      label: "Quiet Base",
      triggered: baseTriggered,
      strength: baseStrength,
      description: priceQuiet
        ? `${input.priceChangePct.toFixed(1)}% over the window — not extended`
        : `Already moved ${input.priceChangePct.toFixed(0)}% — late for a fresh setup`,
    },
  ];
}

export function scoreCheapSignals(signals: CheapSignal[]): {
  score: number;
  maxScore: number;
  scorePct: number;
} {
  const weights: Record<string, number> = {
    coil: 3,
    volume: 3,
    breakout: 2,
    base: 2,
  };
  const maxScore = Object.values(weights).reduce((a, b) => a + b, 0);
  const raw = signals.reduce((sum, s) => {
    const w = weights[s.id] ?? 1;
    return sum + (s.triggered ? w * clamp01(s.strength) : 0);
  }, 0);
  return {
    score: Math.round(raw * 10) / 10,
    maxScore,
    scorePct: maxScore > 0 ? Math.round((raw / maxScore) * 100) : 0,
  };
}

export function deriveCheapTier(
  signals: CheapSignal[],
  scorePct: number,
): Pick<CheapSetup, "tier" | "tierLabel" | "action"> {
  const byId = Object.fromEntries(signals.map((s) => [s.id, s]));
  const coil = byId.coil?.triggered ?? false;
  const volume = byId.volume?.triggered ?? false;
  const breakout = byId.breakout?.triggered ?? false;
  const base = byId.base?.triggered ?? false;

  if (coil && volume && breakout && scorePct >= 55) {
    return {
      tier: "ready",
      tierLabel: "Ready to Move",
      action: "Coiled + volume + near breakout — watch for a daily close above resistance",
    };
  }
  if ((coil && volume) || (coil && breakout) || (volume && breakout && base)) {
    return {
      tier: "setting-up",
      tierLabel: "Setting Up",
      action: "Building heat — add to watchlist, wait for breakout confirmation",
    };
  }
  if (coil || volume || base) {
    return {
      tier: "early",
      tierLabel: "Early",
      action: "Early accumulation — monitor daily, no chase yet",
    };
  }
  return {
    tier: "watch",
    tierLabel: "Watch",
    action: "Weak setup — skip for now",
  };
}

export function scoreCheapSeries(input: {
  ticker: string;
  companyName?: string;
  stockPrice: number;
  bars: PriceBar[];
  volumes: number[];
}): CheapSetup | null {
  const { ticker, companyName, stockPrice, bars, volumes } = input;
  if (bars.length < 15) return null;

  const { score: coilScore, bandWidthPct } = calculateCoilMetrics(bars);
  const priceChangePct = calculatePriceChangePct(bars);
  const dayChange = calcChange1dPct(bars);
  const rvol = calcRelativeVolume(volumes);
  const nearRes = isNearResistance(bars);
  const resistanceLevel = getResistanceLevel(bars);
  const stopLevel = getSwingStop(bars);

  if (priceChangePct > 40 || dayChange > 15) return null;

  const signals = buildCheapSignals({
    coilScore,
    bandWidthPct,
    priceChangePct,
    change1dPct: dayChange,
    relativeVolume: rvol,
    nearResistance: nearRes,
  });
  const { score, maxScore, scorePct } = scoreCheapSignals(signals);
  const tierInfo = deriveCheapTier(signals, scorePct);

  if (tierInfo.tier === "watch" && scorePct < 25) return null;

  return {
    ticker,
    companyName,
    stockPrice,
    score,
    maxScore,
    scorePct,
    ...tierInfo,
    coilScore,
    bandWidthPct,
    priceChangePct,
    change1dPct: dayChange,
    relativeVolume: rvol,
    nearResistance: nearRes,
    resistanceLevel,
    stopLevel,
    signals,
    band: stockPrice < 1 ? "under1" : "oneToFive",
  };
}

export function compareCheapSetups(a: CheapSetup, b: CheapSetup): number {
  const tierRank: Record<CheapTier, number> = {
    ready: 0,
    "setting-up": 1,
    early: 2,
    watch: 3,
  };
  const tierDiff = tierRank[a.tier] - tierRank[b.tier];
  if (tierDiff !== 0) return tierDiff;
  if (b.scorePct !== a.scorePct) return b.scorePct - a.scorePct;
  return (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0);
}
