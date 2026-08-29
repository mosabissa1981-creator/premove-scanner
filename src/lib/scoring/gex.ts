import type { GexLevels, UwGexLevels } from "@/lib/unusualwhales/types";

export function computeGexLevelsFromUw(
  levels: UwGexLevels,
  stockPrice: number,
): GexLevels {
  const gammaFlip = levels.gamma_flip ? parseFloat(levels.gamma_flip) : null;
  const callWall = levels.call_wall ? parseFloat(levels.call_wall) : null;
  const putWall = levels.put_wall ? parseFloat(levels.put_wall) : null;
  const gammaMagnet = levels.gamma_magnet ? parseFloat(levels.gamma_magnet) : null;

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
