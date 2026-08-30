import { describe, it, expect } from "vitest";
import { pickDeepestSaneFlipBelowSpot } from "@/lib/gex-study/gex-study";
import { computeGexLevelsFromUw, resolveGammaFlip } from "@/lib/scoring/gex";

describe("resolveGammaFlip", () => {
  it("rejects deep OTM flips and uses the deepest sane flip at or below spot", () => {
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

  it("prefers the deeper primary flip over a nearer nearby flip (MSFT-style)", () => {
    const flip = resolveGammaFlip(
      {
        gamma_flip: "404.27",
        nearby_flips: ["492.51", "404.27"],
        call_wall: "510",
        put_wall: "500",
        gamma_magnet: null,
      },
      513.15,
      492.51,
    );
    expect(flip).toBeCloseTo(404.27, 1);
  });

  it("merges oi and vol candidates and keeps the deepest flip below spot", () => {
    const oiFlip = resolveGammaFlip(
      {
        gamma_flip: "492.51",
        nearby_flips: ["492.51"],
        call_wall: null,
        put_wall: null,
        gamma_magnet: null,
      },
      513.15,
      null,
    );
    const volFlip = resolveGammaFlip(
      {
        gamma_flip: "404.27",
        nearby_flips: ["404.27"],
        call_wall: null,
        put_wall: null,
        gamma_magnet: null,
      },
      513.15,
      null,
    );
    expect(oiFlip).toBeCloseTo(492.51, 1);
    expect(volFlip).toBeCloseTo(404.27, 1);
    expect(pickDeepestSaneFlipBelowSpot([oiFlip, volFlip], 513.15)).toBeCloseTo(404.27, 1);
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

  it("rejects junk nearby flips far below spot (TSLA-style)", () => {
    const flip = resolveGammaFlip(
      {
        gamma_flip: "344.28",
        nearby_flips: ["344.28", "336.4"],
        call_wall: "400",
        put_wall: "347.5",
        gamma_magnet: "340",
      },
      348.75,
      null,
    );
    expect(flip).toBeCloseTo(344.28, 1);
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
