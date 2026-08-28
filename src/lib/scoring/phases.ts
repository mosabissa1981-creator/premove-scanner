import type { SetupPhase, SignalDetail, TickerAnalysis } from "@/lib/unusualwhales/types";

export function derivePhase(signals: SignalDetail[]): {
  phase: SetupPhase;
  phaseLabel: string;
  action: string;
  holdTime: string;
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
      action: "Swing entry on daily close above resistance with volume. Hold 3–10 days.",
      holdTime: "3–10 day swing",
      tier: "ready",
    };
  }

  if (hasConviction && hasAccumulation) {
    return {
      phase: "conviction",
      phaseLabel: "Smart Money Entering",
      action: "Watchlist only. Enter on breakout — target 5–15 day swing.",
      holdTime: "5–15 day swing",
      tier: "setting-up",
    };
  }

  if (hasAccumulation) {
    return {
      phase: "accumulation",
      phaseLabel: "Quiet Accumulation",
      action: "Too early to enter. Monitor daily until it moves to Setting Up.",
      holdTime: "1–3 weeks out",
      tier: "early",
    };
  }

  if (hasAmplify) {
    return {
      phase: "amplify",
      phaseLabel: "GEX Active",
      action: "Move may be underway. Trail stops — not a new swing entry.",
      holdTime: "Manage open swing",
      tier: "watch",
    };
  }

  return {
    phase: "accumulation",
    phaseLabel: "Weak Setup",
    action: "Insufficient pre-move signals. Skip for swing trades.",
    holdTime: "Skip",
    tier: "watch",
  };
}
