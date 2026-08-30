import type { GexLevels, UwGexLevels } from "@/lib/unusualwhales/types";

function parseLevel(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Reject deep-OTM noise; keep flips in a tradeable band around spot. */
export function isSaneGammaFlip(flip: number, stockPrice: number): boolean {
  if (flip <= 0 || stockPrice <= 0) return false;
  return flip >= stockPrice * 0.25 && flip <= stockPrice * 1.5;
}

/** Prefer UW gex-levels (and nearby_flips) nearest to spot; fall back to profile. */
export function resolveGammaFlip(
  levels: UwGexLevels | null | undefined,
  stockPrice: number,
  profileFlip: number | null,
): number | null {
  const candidates: number[] = [];
  const primary = parseLevel(levels?.gamma_flip);
  if (primary != null) candidates.push(primary);
  for (const flip of levels?.nearby_flips ?? []) {
    const parsed = parseLevel(flip);
    if (parsed != null) candidates.push(parsed);
  }

  const sane =
    stockPrice > 0
      ? candidates.filter((flip) => isSaneGammaFlip(flip, stockPrice))
      : candidates.filter((flip) => flip > 0);

  if (sane.length) {
    const belowSpot = sane.filter((flip) => flip <= stockPrice + 1e-6);
    if (belowSpot.length) return Math.max(...belowSpot);
    return sane.reduce((best, flip) =>
      Math.abs(flip - stockPrice) < Math.abs(best - stockPrice) ? flip : best,
    );
  }

  if (profileFlip != null && stockPrice > 0 && isSaneGammaFlip(profileFlip, stockPrice)) {
    return profileFlip;
  }

  return null;
}

export function computeGexLevelsFromUw(
  levels: UwGexLevels,
  stockPrice: number,
): GexLevels {
  const callWall = parseLevel(levels.call_wall);
  const putWall = parseLevel(levels.put_wall);
  const gammaMagnet = parseLevel(levels.gamma_magnet);
  const gammaFlip = resolveGammaFlip(levels, stockPrice, null);

  let regime: GexLevels["regime"] = "neutral";
  if (gammaFlip !== null && stockPrice > 0) {
    regime = stockPrice >= gammaFlip ? "positive" : "negative";
  }

  const flipDistancePct =
    gammaFlip !== null && stockPrice > 0
      ? ((stockPrice - gammaFlip) / stockPrice) * 100
      : null;

  return {
    gammaFlip,
    callWall,
    putWall,
    gammaMagnet,
    stockPrice,
    regime,
    flipDistancePct,
  };
}
