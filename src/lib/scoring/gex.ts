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

/** Flip must sit in a tradeable band near spot (rejects deep junk like TSLA ~$104). */
export function isRelevantGammaFlip(flip: number, stockPrice: number): boolean {
  if (!isSaneGammaFlip(flip, stockPrice)) return false;
  return flip >= stockPrice * 0.5;
}

function isUsableFlip(flip: number, stockPrice: number): boolean {
  if (flip <= 0) return false;
  if (stockPrice <= 0) return true;
  return isRelevantGammaFlip(flip, stockPrice);
}

/** Prefer profile zero-cross near spot; otherwise nearest sane UW flip. */
export function resolveGammaFlip(
  levels: UwGexLevels | null | undefined,
  stockPrice: number,
  profileFlip: number | null,
): number | null {
  if (profileFlip != null && isUsableFlip(profileFlip, stockPrice)) {
    return profileFlip;
  }

  const candidates = [
    parseLevel(levels?.gamma_flip),
    ...(levels?.nearby_flips ?? []).map(parseLevel),
  ].filter((flip): flip is number => flip != null && isUsableFlip(flip, stockPrice));

  if (!candidates.length) return null;
  if (stockPrice <= 0) return candidates[0];

  return candidates.reduce((best, flip) =>
    Math.abs(flip - stockPrice) < Math.abs(best - stockPrice) ? flip : best,
  );
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
