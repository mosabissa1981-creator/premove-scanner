import type { TickerAnalysis } from "@/lib/unusualwhales/types";
import type { PhaseResult } from "@/lib/scoring/phases";

/** 30d move already happened — too late for a fresh 1–2 week options swing. */
export const EXTENDED_MOVE_PCT = 18;

/** 30d downtrend — not a long-side swing setup. */
export const DOWNTREND_PCT = -10;

/** Minimum graded score to stay in Ready (max = 11). */
export const READY_MIN_SCORE = 5;

/** Weak Setting Up / Flow Without Coil noise floor. */
export const SETTING_UP_MIN_SCORE = 4.5;

/**
 * Post-process tiers so options-swing lists stay single-name + coiled.
 * Extended runners and downtrends are demoted from Ready *and* Setting Up
 * (they used to clutter Setting Up as "Flow Without Coil").
 */
export function applySetupQualityFilter(
  phase: PhaseResult,
  opts: { score: number; priceChangePct: number },
): PhaseResult {
  const { score, priceChangePct } = opts;

  // Extended / downtrend: never keep as tradeable Ready or Setting Up.
  if (phase.tier === "ready" || phase.tier === "setting-up") {
    if (priceChangePct > EXTENDED_MOVE_PCT) {
      return {
        phase: "amplify",
        phaseLabel: "Already Extended",
        action: `Already up ${priceChangePct.toFixed(0)}% over ~30d. Too late for a fresh options swing — skip or trail only.`,
        holdTime: "Skip new entry",
        tier: "watch",
      };
    }
    if (priceChangePct < DOWNTREND_PCT) {
      return {
        phase: "accumulation",
        phaseLabel: "Downtrend Risk",
        action: `Down ${Math.abs(priceChangePct).toFixed(0)}% over ~30d. Not a long options swing.`,
        holdTime: "Skip",
        tier: "watch",
      };
    }
  }

  if (phase.tier === "ready" && score < READY_MIN_SCORE) {
    return {
      phase: "conviction",
      phaseLabel: "Needs More Confirmation",
      action:
        "Near Ready but score is still light. Wait for stronger coil + flow before entering.",
      holdTime: "1–2 week options swing",
      tier: "setting-up",
    };
  }

  // Drop weak Flow-Without-Coil / low-score Setting Up so ETF-ish noise vanishes.
  if (
    phase.tier === "setting-up" &&
    (score < SETTING_UP_MIN_SCORE ||
      (phase.phaseLabel.toLowerCase().includes("flow without coil") && score < 6))
  ) {
    return {
      phase: "conviction",
      phaseLabel: "Weak Flow Signal",
      action:
        "Call flow alone is not enough. Need tighter coil + higher score before it earns a watchlist slot.",
      holdTime: "Skip",
      tier: "watch",
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
