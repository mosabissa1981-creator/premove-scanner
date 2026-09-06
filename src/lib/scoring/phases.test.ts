import { describe, it, expect } from "vitest";
import { derivePhase } from "@/lib/scoring/phases";
import type { SetupPhase, SignalDetail } from "@/lib/unusualwhales/types";

function signal(phase: SetupPhase, triggered: boolean): SignalDetail {
  return {
    id: phase,
    label: phase,
    phase,
    points: 1,
    triggered,
    strength: triggered ? 1 : 0,
    description: "",
  };
}

describe("derivePhase", () => {
  it("returns 'setting-up' (Flow Without Coil) for ignition + conviction without accumulation", () => {
    const result = derivePhase([signal("ignition", true), signal("conviction", true)]);
    expect(result.tier).toBe("setting-up");
    expect(result.phaseLabel).toBe("Flow Without Coil");
    expect(result.phase).toBe("conviction");
  });

  it("returns 'ready' when ignition fires alongside accumulation", () => {
    expect(derivePhase([signal("ignition", true), signal("accumulation", true)]).tier).toBe(
      "ready",
    );
  });

  it("returns 'ready' when ignition + accumulation + conviction all fire", () => {
    const result = derivePhase([
      signal("ignition", true),
      signal("accumulation", true),
      signal("conviction", true),
    ]);
    expect(result.tier).toBe("ready");
    expect(result.phaseLabel).toBe("Ready to Break");
  });

  it("returns 'setting-up' for conviction + accumulation without ignition", () => {
    const result = derivePhase([signal("conviction", true), signal("accumulation", true)]);
    expect(result.tier).toBe("setting-up");
    expect(result.phase).toBe("conviction");
  });

  it("returns 'early' for accumulation only", () => {
    expect(derivePhase([signal("accumulation", true)]).tier).toBe("early");
  });

  it("returns 'watch' with a GEX label for amplify only", () => {
    const result = derivePhase([signal("amplify", true)]);
    expect(result.tier).toBe("watch");
    expect(result.phaseLabel).toBe("GEX Active");
  });

  it("returns a weak 'watch' setup when nothing triggers", () => {
    const result = derivePhase([signal("accumulation", false), signal("conviction", false)]);
    expect(result.tier).toBe("watch");
    expect(result.phaseLabel).toBe("Weak Setup");
  });
});
