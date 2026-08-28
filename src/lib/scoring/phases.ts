import type { SetupPhase, SignalDetail, TickerAnalysis } from "@/lib/unusualwhales/types";

export function derivePhase(signals: SignalDetail[]): {
  phase: SetupPhase;
  phaseLabel: string;
  action: string;
  tier: TickerAnalysis["tier"];
} {
  const triggered = new Set(signals.filter((s) => s.triggered).map((s) => s.phase));

  const hasAccumulation = triggered.has("accumulation");
  const hasConviction = triggered.has("conviction");
  const hasIgnition = triggered.has("ignition");
  const hasAmplify = triggered.has("amplify");

  if (hasIgnition && (hasConviction || hasAccumulation)) {
    return {
      phase: "ignition",
      phaseLabel: "Ready to Break",
      action: "Watch for volume breakout above resistance. GEX may accelerate the move.",
      tier: "ready",
    };
  }

  if (hasConviction && hasAccumulation) {
    return {
      phase: "conviction",
      phaseLabel: "Smart Money Entering",
      action: "Add to watchlist. Wait for price to approach resistance before entry.",
      tier: "setting-up",
    };
  }

  if (hasAccumulation) {
    return {
      phase: "accumulation",
      phaseLabel: "Quiet Accumulation",
      action: "Early — institutions building. Monitor daily, don't chase yet.",
      tier: "early",
    };
  }

  if (hasAmplify) {
    return {
      phase: "amplify",
      phaseLabel: "GEX Active",
      action: "Move may be underway. Use GEX levels for hold/exit, not new entries.",
      tier: "watch",
    };
  }

  return {
    phase: "accumulation",
    phaseLabel: "Weak Setup",
    action: "Insufficient pre-move signals. Skip or keep on radar only.",
    tier: "watch",
  };
}
