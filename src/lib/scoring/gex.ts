import type { ExposureByStrikeResponse, GexLevels } from "@/lib/quantdata/types";

export function computeGexLevels(response: ExposureByStrikeResponse, ticker: string): GexLevels | null {
  const entry = response.data[ticker];
  if (!entry) return null;

  const strikeNetGamma: Record<number, number> = {};

  for (const strikes of Object.values(entry.exposureMap)) {
    for (const [strikeStr, cell] of Object.entries(strikes)) {
      const strike = parseFloat(strikeStr);
      const call = cell.callExposure ?? 0;
      const put = cell.putExposure ?? 0;
      strikeNetGamma[strike] = (strikeNetGamma[strike] ?? 0) + call + put;
    }
  }

  const strikes = Object.keys(strikeNetGamma)
    .map(Number)
    .sort((a, b) => a - b);

  if (strikes.length === 0) {
    return {
      netGamma: 0,
      gammaFlip: null,
      callWall: null,
      putWall: null,
      stockPrice: entry.stockPrice,
      regime: "neutral",
      flipDistancePct: null,
    };
  }

  const netGamma = strikes.reduce((sum, s) => sum + strikeNetGamma[s], 0);

  let gammaFlip: number | null = null;
  for (let i = 1; i < strikes.length; i++) {
    const prev = strikeNetGamma[strikes[i - 1]];
    const curr = strikeNetGamma[strikes[i]];
    if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
      gammaFlip = (strikes[i - 1] + strikes[i]) / 2;
      break;
    }
  }

  const callWall = strikes.reduce(
    (best, s) => (strikeNetGamma[s] > (strikeNetGamma[best] ?? -Infinity) ? s : best),
    strikes[0],
  );

  const putWall = strikes.reduce(
    (best, s) => (strikeNetGamma[s] < (strikeNetGamma[best] ?? Infinity) ? s : best),
    strikes[0],
  );

  const price = entry.stockPrice;
  let regime: GexLevels["regime"] = "neutral";
  if (gammaFlip !== null) {
    regime = price >= gammaFlip ? "positive" : "negative";
  } else {
    regime = netGamma >= 0 ? "positive" : "negative";
  }

  const flipDistancePct =
    gammaFlip !== null && price > 0 ? ((price - gammaFlip) / price) * 100 : null;

  return {
    netGamma,
    gammaFlip,
    callWall,
    putWall,
    stockPrice: price,
    regime,
    flipDistancePct,
  };
}
