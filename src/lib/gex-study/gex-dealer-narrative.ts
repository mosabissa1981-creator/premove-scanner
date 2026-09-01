import type { GexStudyResult } from "@/lib/unusualwhales/types";

export interface GexDealerNarrative {
  summary: string;
  bullets: string[];
  horizon: string;
  validity: string;
}

export interface GexDealerNarrativeInput {
  stockPrice: number | null;
  gammaFlip: number | null;
  putWall: number | null;
  callWall: number | null;
  regime: GexStudyResult["regime"];
  flipDistancePct: number | null;
  netGex: number;
  expiry?: string;
  dte?: number | null;
}

const WALL_NEAR_PCT = 2;
const WALL_CLOSE_PCT = 5;
const FLIP_FRAGILE_PCT = 2;

function formatStrike(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function pctFromSpot(spot: number, level: number): number {
  return ((level - spot) / spot) * 100;
}

function resolveDte(
  expiry: string | undefined,
  availableExpiries: { expiry: string; dte: number }[],
): number | null {
  if (!expiry || expiry === "all") return null;
  const match = availableExpiries.find((row) => row.expiry === expiry);
  return match?.dte ?? null;
}

export function resolveStructureHorizon(dte: number | null | undefined): string {
  if (dte == null) return "Structure may span multiple expiries while this profile is aggregated.";
  if (dte <= 0) return "0DTE — pinning pressure usually intensifies into today's close.";
  if (dte <= 2) return `${dte} DTE — levels often matter through this session and the next day or two.`;
  if (dte <= 7) return `${dte} DTE — weekly structure can guide price for several sessions.`;
  if (dte <= 21) return `${dte} DTE — monthly-style structure; less intraday pin, more multi-day zones.`;
  return `${dte} DTE — longer-dated book; walls are slower-moving context, not tight pins.`;
}

function regimeBias(regime: GexStudyResult["regime"]): string {
  if (regime === "positive") {
    return "Dealers tend to hedge against the move (buy dips, sell rips) — trends dampen and chop is common.";
  }
  if (regime === "negative") {
    return "Dealers tend to hedge with the move — rallies and selloffs can accelerate.";
  }
  return "Gamma regime is unclear — lean on wall distances more than dampening vs amplification.";
}

function regimeLabel(regime: GexStudyResult["regime"]): string {
  if (regime === "positive") return "positive gamma";
  if (regime === "negative") return "negative gamma";
  return "neutral gamma";
}

function netGexNote(netGex: number): string | null {
  const abs = Math.abs(netGex);
  if (abs < 1_000_000) return null;
  if (netGex > 0) return "Net GEX is positive — dampening pressure is relatively strong.";
  return "Net GEX is negative — amplification risk is elevated even near walls.";
}

function wallProximityBullet(
  label: string,
  spot: number,
  wall: number,
  direction: "above" | "below",
): string | null {
  const distancePct = pctFromSpot(spot, wall);
  const abs = Math.abs(distancePct);
  const strike = formatStrike(wall);

  if (abs <= WALL_NEAR_PCT) {
    return `${label} ${strike} is only ${abs.toFixed(1)}% ${direction} spot — price is pressing dealer ${label.toLowerCase()} resistance.`;
  }
  if (abs <= WALL_CLOSE_PCT) {
    return `${label} ${strike} is ${abs.toFixed(1)}% ${direction} spot — nearby ${label.toLowerCase()} may slow or stall moves in that direction.`;
  }
  if (direction === "above") {
    return `${label} ${strike} is ${abs.toFixed(1)}% above spot — upside room before the next major call-side wall.`;
  }
  return `${label} ${strike} is ${abs.toFixed(1)}% below spot — nearest put-side support sits lower.`;
}

export function buildGexDealerNarrative(input: GexDealerNarrativeInput): GexDealerNarrative {
  const spot = input.stockPrice;
  if (spot == null || spot <= 0) {
    return {
      summary: "Spot price unavailable — dealer read needs a live underlying.",
      bullets: [],
      horizon: "—",
      validity: "—",
    };
  }

  const bullets: string[] = [];
  const flip = input.gammaFlip;
  const flipDistance = input.flipDistancePct;

  if (flip != null && flipDistance != null) {
    const side = flipDistance >= 0 ? "above" : "below";
    const absFlip = Math.abs(flipDistance);
    const fragile =
      absFlip <= FLIP_FRAGILE_PCT
        ? " Regime is fragile — a small move can flip the book."
        : "";
    bullets.push(
      `Spot ${formatStrike(spot)} is ${side} gamma flip ${formatStrike(flip)} (${flipDistance >= 0 ? "+" : ""}${flipDistance.toFixed(1)}%) → ${regimeLabel(input.regime)} regime.${fragile}`,
    );
  } else if (flip != null) {
    bullets.push(
      `Gamma flip sits at ${formatStrike(flip)} — ${regimeLabel(input.regime)} while spot holds ${spot >= flip ? "above" : "below"} that line.`,
    );
  } else {
    bullets.push(`Gamma flip unavailable — using wall distances for structure.`);
  }

  bullets.push(regimeBias(input.regime));

  const netNote = netGexNote(input.netGex);
  if (netNote) bullets.push(netNote);

  if (input.callWall != null && input.callWall > 0) {
    const callBullet = wallProximityBullet("Call wall", spot, input.callWall, "above");
    if (callBullet) bullets.push(callBullet);
  }

  if (input.putWall != null && input.putWall > 0) {
    const putBullet = wallProximityBullet("Put wall", spot, input.putWall, "below");
    if (putBullet) bullets.push(putBullet);
  }

  let summary: string;
  if (input.regime === "positive") {
    summary =
      input.callWall != null && pctFromSpot(spot, input.callWall) <= WALL_CLOSE_PCT
        ? "Positive gamma — expect grind or chop into nearby call-wall resistance."
        : "Positive gamma — expect dampened moves and mean-reversion inside the structure.";
  } else if (input.regime === "negative") {
    summary = "Negative gamma — breakouts and breakdowns can extend faster than in positive gamma.";
  } else {
    summary = "Mixed gamma context — watch flip and walls for the next directional tell.";
  }

  const horizon = resolveStructureHorizon(input.dte);

  let validity = "Structure resets when spot reclaims or loses key levels on volume.";
  if (flip != null) {
    validity =
      input.regime === "positive"
        ? `Positive-gamma bias holds while spot stays above ${formatStrike(flip)} on a closing basis.`
        : input.regime === "negative"
          ? `Negative-gamma bias holds while spot stays below ${formatStrike(flip)} on a closing basis.`
          : `Regime clarifies on a sustained break of ${formatStrike(flip)}.`;
  }

  return { summary, bullets, horizon, validity };
}

export function buildGexDealerNarrativeFromStudy(study: GexStudyResult): GexDealerNarrative {
  return buildGexDealerNarrative({
    stockPrice: study.stockPrice,
    gammaFlip: study.gammaFlip,
    putWall: study.putWall,
    callWall: study.callWall,
    regime: study.regime,
    flipDistancePct: study.flipDistancePct,
    netGex: study.netGex,
    expiry: study.expiry,
    dte: resolveDte(study.expiry, study.availableExpiries),
  });
}
