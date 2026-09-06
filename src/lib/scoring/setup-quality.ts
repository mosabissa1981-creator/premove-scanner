import type { TickerAnalysis } from "@/lib/unusualwhales/types";
import type { PhaseResult } from "@/lib/scoring/phases";

/** 30d move already happened — too late for a fresh pre-move swing. */
export const EXTENDED_MOVE_PCT = 15;

/** 30d downtrend — not a long-side swing setup. */
export const DOWNTREND_PCT = -8;

/** Minimum graded score to stay in Ready (max = 11). */
export const READY_MIN_SCORE = 6;

/**
 * Post-process Ready setups so winners look like CRWV (flat + coil + score)
 * and losers (extended runners / downtrends / weak scores) get demoted.
 */
export function applySetupQualityFilter(
  phase: PhaseResult,
  opts: { score: number; priceChangePct: number },
): PhaseResult {
  if (phase.tier !== "ready") return phase;

  const { score, priceChangePct } = opts;

  if (priceChangePct > EXTENDED_MOVE_PCT) {
    return {
      phase: "amplify",
      phaseLabel: "Already Extended",
      action: `Already up ${priceChangePct.toFixed(0)}% over ~30d. Too late for a fresh swing entry — skip or trail only.`,
      holdTime: "Skip new entry",
      tier: "watch",
    };
  }

  if (priceChangePct < DOWNTREND_PCT) {
    return {
      phase: "accumulation",
      phaseLabel: "Downtrend Risk",
      action: `Down ${Math.abs(priceChangePct).toFixed(0)}% over ~30d. Not a long swing setup.`,
      holdTime: "Skip",
      tier: "watch",
    };
  }

  if (score < READY_MIN_SCORE) {
    return {
      phase: "conviction",
      phaseLabel: "Needs More Confirmation",
      action:
        "Near Ready but score is still light. Wait for stronger coil + flow before entering.",
      holdTime: "5–15 day swing",
      tier: "setting-up",
    };
  }

  return phase;
}

/** Tier → flatness → coil → score. Prefer CRWV-like flat coils over extended chases. */
export function compareSetupQuality(a: TickerAnalysis, b: TickerAnalysis): number {
  const tierOrder: Record<TickerAnalysis["tier"], number> = {
    ready: 0,
    "setting-up": 1,
    early: 2,
    watch: 3,
  };

  const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
  if (tierDiff !== 0) return tierDiff;

  const flatDiff = Math.abs(a.priceChangePct) - Math.abs(b.priceChangePct);
  if (Math.abs(flatDiff) > 0.05) return flatDiff;

  const coilDiff = b.coilScore - a.coilScore;
  if (coilDiff !== 0) return coilDiff;

  return b.score - a.score;
}
