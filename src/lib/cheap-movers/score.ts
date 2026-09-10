import {
  calculateCoilMetrics,
  calculatePriceChangePct,
  getResistanceLevel,
  getSwingStop,
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

/** Lighter entry thresholds — more names qualify as watchlist / early setups. */
export const COIL_LIGHT = {
  coilMin: 45,
  volumeHeatMin: 1.15,
  volumeSurgeMin: 1.8,
  /** Max |~3mo| move still treated as "quiet enough". */
  quietMovePct: 22,
  /** Max 1d move still allowed for volume / breakout signals. */
  spikeMaxPct: 12,
  /** Quiet-base window. */
  baseMovePct: 12,
  /** Distance under prior high that still counts as near breakout. */
  nearResistancePct: 5,
  /** Hard skips only for very extended runners. */
  skipExtendedPct: 65,
  skipDaySpikePct: 25,
  /** Drop only the weakest leftovers. */
  dropBelowScorePct: 8,
  readyMinScorePct: 35,
  settingUpMinScorePct: 20,
} as const;

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

/** Within `maxPct` under the prior 10-day high (looser than the shared 2% helper). */
export function isNearResistanceLoose(
  bars: PriceBar[],
  maxPct = COIL_LIGHT.nearResistancePct,
): boolean {
  if (bars.length < 11) return false;
  const prior = bars.slice(-11, -1);
  const resistance = Math.max(...prior.map((b) => b.highPrice));
  const current = bars[bars.length - 1].closePrice;
  if (resistance <= 0) return false;
  const distancePct = ((resistance - current) / resistance) * 100;
  // Allow a touch slightly through the high (up to 1%).
  return distancePct <= maxPct && distancePct >= -1;
}

export function buildCheapSignals(input: {
  coilScore: number;
  bandWidthPct: number;
  priceChangePct: number;
  change1dPct: number;
  relativeVolume: number | null;
  nearResistance: boolean;
}): CheapSignal[] {
  const priceQuiet = Math.abs(input.priceChangePct) < COIL_LIGHT.quietMovePct;
  const notSpiking = Math.abs(input.change1dPct) < COIL_LIGHT.spikeMaxPct;
  const coilTight = input.coilScore >= COIL_LIGHT.coilMin;
  const rvol = input.relativeVolume ?? 0;
  const volumeHeat = rvol >= COIL_LIGHT.volumeHeatMin;
  const volumeSurge = rvol >= COIL_LIGHT.volumeSurgeMin;

  // Coil can fire on compression alone — price doesn't need to be perfectly flat.
  const coilTriggered = coilTight;
  const coilStrength = coilTriggered
    ? gradedFactor(ramp(input.coilScore, COIL_LIGHT.coilMin, 85))
    : 0;

  // Volume heat no longer requires a dead-flat day — only block big spikes.
  const volTriggered = volumeHeat && notSpiking;
  const volStrength = volTriggered
    ? volumeSurge
      ? 1
      : gradedFactor(ramp(rvol, COIL_LIGHT.volumeHeatMin, 3.5))
    : 0;

  const techTriggered = input.nearResistance && notSpiking;
  const techStrength = techTriggered ? 1 : 0;

  const baseTriggered = priceQuiet && Math.abs(input.priceChangePct) < COIL_LIGHT.baseMovePct;
  const baseStrength = baseTriggered
    ? gradedFactor(1 - clamp01(Math.abs(input.priceChangePct) / COIL_LIGHT.baseMovePct))
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
            ? `${input.relativeVolume.toFixed(1)}× average volume`
            : `${input.relativeVolume.toFixed(1)}× average volume — not hot yet`,
    },
    {
      id: "breakout",
      label: "Near Breakout",
      triggered: techTriggered,
      strength: techStrength,
      description: techTriggered
        ? `Within ${COIL_LIGHT.nearResistancePct}% of recent high — breakout zone`
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
  const hits = [coil, volume, breakout].filter(Boolean).length;

  // Ready: any 2 of coil/volume/breakout at a moderate score — not all three.
  if (hits >= 2 && scorePct >= COIL_LIGHT.readyMinScorePct) {
    return {
      tier: "ready",
      tierLabel: "Ready to Move",
      action: "Setup is live — watch for a daily close above resistance for entry",
    };
  }

  // Setting up: one strong signal + base, or coil/volume alone with some score.
  if (
    (coil && volume) ||
    (coil && breakout) ||
    (volume && breakout) ||
    (coil && base) ||
    (volume && base) ||
    (breakout && base) ||
    (hits >= 1 && scorePct >= COIL_LIGHT.settingUpMinScorePct)
  ) {
    return {
      tier: "setting-up",
      tierLabel: "Setting Up",
      action: "Building heat — add to watchlist, wait for breakout confirmation",
    };
  }

  if (coil || volume || base || breakout || scorePct >= COIL_LIGHT.dropBelowScorePct) {
    return {
      tier: "early",
      tierLabel: "Early",
      action: "Early accumulation — monitor daily, size small if you enter",
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
  const nearRes = isNearResistanceLoose(bars);
  const resistanceLevel = getResistanceLevel(bars);
  const stopLevel = getSwingStop(bars);

  if (priceChangePct > COIL_LIGHT.skipExtendedPct || dayChange > COIL_LIGHT.skipDaySpikePct) {
    return null;
  }

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

  if (tierInfo.tier === "watch" && scorePct < COIL_LIGHT.dropBelowScorePct) return null;

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
