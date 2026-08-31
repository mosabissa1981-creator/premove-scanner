/**
 * GEX study helpers — re-exports global math engine + merge/dedupe utilities.
 * All profile math lives in `@/utils/gamma-math`.
 */

export type {
  GammaProfileSimOptions,
  OptionChainLeg,
  RawSimulatedPoint,
  SimulatedProfilePoint,
} from "@/utils/gamma-math";

export {
  blackScholesGamma,
  buildChainSimulatedGammaProfile,
  buildIsolatedRebaseAtFlip,
  buildLocalizedBarProfileAtFlip,
  buildProfileAtFlip,
  buildProfileAtFlipFromIsolated,
  buildSimulatedProfileFromRawTotals,
  contractTimeYears,
  dollarGammaExposure,
  gammaFlipFromRawProfile,
  normPdf,
  rebaseProfileAtFlip,
  simulateRawNetGexProfile,
  totalGammaAtSpot,
} from "@/utils/gamma-math";

import type { OptionChainLeg, SimulatedProfilePoint } from "@/utils/gamma-math";
import {
  buildChainSimulatedGammaProfile,
  buildLocalizedBarProfileAtFlip,
  buildSimulatedProfileFromRawTotals,
  gammaFlipFromRawProfile,
  simulateRawNetGexProfile,
} from "@/utils/gamma-math";

/** @deprecated Use `buildSimulatedProfileFromRawTotals` from `@/utils/gamma-math`. */
export function buildRebaseAtFlipProfile(
  raw: { simulatedSpot: number; rawNetGex: number }[],
  gammaFlip: number,
): SimulatedProfilePoint[] {
  return buildSimulatedProfileFromRawTotals(raw, gammaFlip);
}

/** @deprecated Use `buildLocalizedBarProfileAtFlip` from `@/utils/gamma-math`. */
export function buildRebaseAtFlipFromValues(
  spots: number[],
  rawValues: number[],
  gammaFlip: number,
): SimulatedProfilePoint[] {
  return buildLocalizedBarProfileAtFlip(spots, rawValues, gammaFlip).map((point) => ({
    simulatedSpot: point.x,
    profile: point.profile,
    rawNetGex: point.rawValue,
  }));
}

/** @deprecated Use `buildSimulatedProfileFromRawTotals` from `@/utils/gamma-math`. */
export function buildIsolatedProfileAtFlip(
  spots: number[],
  rawValues: number[],
  gammaFlip: number,
): SimulatedProfilePoint[] {
  return buildSimulatedProfileFromRawTotals(
    spots.map((simulatedSpot, index) => ({
      simulatedSpot,
      rawNetGex: rawValues[index] ?? 0,
    })),
    gammaFlip,
  );
}

/** Full OptionCharts profile for any ticker chain. */
export function simulateGammaProfile(
  legs: OptionChainLeg[],
  stockPrice: number,
  options: import("@/utils/gamma-math").GammaProfileSimOptions = {},
): SimulatedProfilePoint[] {
  const raw = simulateRawNetGexProfile(legs, stockPrice, options);
  if (!raw.length) return [];

  const gammaFlip =
    options.gammaFlip ??
    gammaFlipFromRawProfile(raw, stockPrice) ??
    stockPrice;

  return buildChainSimulatedGammaProfile(legs, stockPrice, gammaFlip, options);
}

export function interpolateSimulatedProfile(
  profile: SimulatedProfilePoint[],
  spot: number,
): number | null {
  if (!profile.length || !Number.isFinite(spot)) return null;
  const sorted = [...profile].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  if (spot <= sorted[0].simulatedSpot) return sorted[0].profile;
  const last = sorted[sorted.length - 1];
  if (spot >= last.simulatedSpot) return last.profile;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (spot < prev.simulatedSpot || spot > curr.simulatedSpot) continue;
    const span = curr.simulatedSpot - prev.simulatedSpot;
    if (span === 0) return curr.profile;
    const ratio = (spot - prev.simulatedSpot) / span;
    return prev.profile + ratio * (curr.profile - prev.profile);
  }

  return null;
}

export function gammaFlipFromSimulatedProfile(
  profile: SimulatedProfilePoint[],
  stockPrice: number,
): number | null {
  if (!profile.length || stockPrice <= 0) return null;

  const sorted = [...profile].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  const minStrike = stockPrice * 0.45;
  let deepest: number | null = null;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.simulatedSpot > stockPrice || prev.simulatedSpot < minStrike) continue;
    if (prev.profile <= 0 && curr.profile >= 0) {
      const span = curr.profile - prev.profile;
      const flip =
        span === 0
          ? curr.simulatedSpot
          : prev.simulatedSpot +
            (-prev.profile / span) * (curr.simulatedSpot - prev.simulatedSpot);
      if (deepest == null || flip < deepest) deepest = flip;
    }
  }

  return deepest;
}

export function flipIndexForPrice(
  raw: { simulatedSpot: number }[],
  gammaFlip: number,
): number {
  const sorted = [...raw].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  let flipIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].simulatedSpot <= gammaFlip) flipIndex = i;
  }
  return flipIndex;
}

/** Merge dense simulated profile with bar strikes for a smooth curve + accurate tooltips. */
export function mergeSimulatedProfileOntoBars(
  bars: { strike: number; callGex: number; putGex: number; netGex: number; profile: number }[],
  profile: SimulatedProfilePoint[],
  gammaFlip: number | null = null,
): typeof bars {
  if (!profile.length) {
    return bars.map((point) => ({ ...point, profile: 0 }));
  }

  const sortedProfile = [...profile].sort((a, b) => a.simulatedSpot - b.simulatedSpot);
  const barByStrike = new Map(
    bars.map((bar) => [Number(bar.strike).toFixed(4), bar]),
  );

  const merged: typeof bars = [];
  for (const point of sortedProfile) {
    const strikeKey = Number(point.simulatedSpot).toFixed(4);
    const bar = barByStrike.get(strikeKey);
    if (bar) {
      merged.push({ ...bar, profile: point.profile });
      continue;
    }
    merged.push({
      strike: point.simulatedSpot,
      callGex: 0,
      putGex: 0,
      netGex: 0,
      profile: point.profile,
    });
  }

  for (const bar of bars) {
    const strikeKey = Number(bar.strike).toFixed(4);
    if (!merged.some((point) => Number(point.strike).toFixed(4) === strikeKey)) {
      merged.push({
        ...bar,
        profile: interpolateSimulatedProfile(profile, bar.strike) ?? 0,
      });
    }
  }

  const sorted = merged.sort((a, b) => a.strike - b.strike);
  if (gammaFlip == null) return sorted;

  const hasFlip = sorted.some((point) => Math.abs(point.strike - gammaFlip) < 1e-6);
  if (hasFlip) return sorted;

  const anchor = {
    strike: gammaFlip,
    callGex: 0,
    putGex: 0,
    netGex: 0,
    profile: 0,
  };
  return [...sorted, anchor].sort((a, b) => a.strike - b.strike);
}

export function dedupeChainLegs(legs: OptionChainLeg[]): OptionChainLeg[] {
  const byKey = new Map<string, OptionChainLeg>();
  for (const leg of legs) {
    const key = `${leg.expiry}|${leg.strike}|${leg.type}`;
    const existing = byKey.get(key);
    if (!existing || leg.oi > existing.oi) {
      byKey.set(key, leg);
    }
  }
  return [...byKey.values()];
}
