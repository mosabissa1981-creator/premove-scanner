import { describe, it, expect } from "vitest";
import { computeGexLevelsFromUw, resolveGammaFlip } from "@/lib/scoring/gex";

describe("resolveGammaFlip", () => {
  it("rejects deep OTM flips and uses the first sane nearby flip at or below spot", () => {
    const flip = resolveGammaFlip(
      {
        gamma_flip: "4.5",
        nearby_flips: ["4.5", "199.77", "210"],
        call_wall: null,
        put_wall: null,
        gamma_magnet: null,
      },
      217.55,
      null,
    );
    expect(flip).toBeCloseTo(199.77, 1);
  });

  it("uses nearby_flips when primary flip is deep OTM", () => {
    const flip = resolveGammaFlip(
      {
        gamma_flip: "4.5",
        nearby_flips: ["4.5", "199.77"],
        call_wall: null,
        put_wall: null,
        gamma_magnet: null,
      },
      217.55,
      null,
    );
    expect(flip).toBeCloseTo(199.77, 1);
  });
});

describe("computeGexLevelsFromUw", () => {
  it("reads a positive regime when price is above the gamma flip", () => {
    const gex = computeGexLevelsFromUw(
      { gamma_flip: "90", call_wall: "110", put_wall: "80", gamma_magnet: "95" },
      100,
    );
    expect(gex.regime).toBe("positive");
    expect(gex.flipDistancePct).toBeCloseTo(10);
    expect(gex.callWall).toBe(110);
    expect(gex.putWall).toBe(80);
    expect(gex.gammaMagnet).toBe(95);
  });

  it("reads a negative regime when price is below the gamma flip", () => {
    const gex = computeGexLevelsFromUw(
      { gamma_flip: "110", call_wall: null, put_wall: null, gamma_magnet: null },
      100,
    );
    expect(gex.regime).toBe("negative");
    expect(gex.flipDistancePct).toBeCloseTo(-10);
  });

  it("is neutral with no flip data", () => {
    const gex = computeGexLevelsFromUw(
      { gamma_flip: null, call_wall: null, put_wall: null, gamma_magnet: null },
      100,
    );
    expect(gex.regime).toBe("neutral");
    expect(gex.gammaFlip).toBeNull();
    expect(gex.flipDistancePct).toBeNull();
  });

  it("stays neutral and null when price is unknown", () => {
    const gex = computeGexLevelsFromUw(
      { gamma_flip: "90", call_wall: "110", put_wall: "80", gamma_magnet: "95" },
      0,
    );
    expect(gex.regime).toBe("neutral");
    expect(gex.flipDistancePct).toBeNull();
  });
});
