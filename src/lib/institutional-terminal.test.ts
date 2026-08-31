import { describe, expect, it } from "vitest";
import {
  detectStructuralProximity,
  isWithinPctBand,
  matchesWallStrike,
} from "@/lib/alerts/proximity";
import { buildWebhookPayload } from "@/lib/alerts/webhook";
import { buildIvSmileFromLegs } from "@/lib/gex-study/gex-study";
import { filterLegsForOdte } from "@/utils/gamma-math";

describe("filterLegsForOdte", () => {
  it("keeps only contracts expiring on the trading date", () => {
    const legs = [
      { strike: 100, type: "C" as const, oi: 10, iv: 0.3, expiry: "2026-08-31", dte: 0 },
      { strike: 105, type: "P" as const, oi: 12, iv: 0.35, expiry: "2026-09-05", dte: 5 },
    ];
    expect(filterLegsForOdte(legs, "2026-08-31")).toEqual([legs[0]]);
  });
});

describe("buildIvSmileFromLegs", () => {
  it("maps legs to strike/iv/type smile points", () => {
    const smile = buildIvSmileFromLegs([
      { strike: 100, type: "C", oi: 1, iv: 0.25, expiry: "2026-08-31", dte: 0 },
      { strike: 100, type: "P", oi: 1, iv: 0.3, expiry: "2026-08-31", dte: 0 },
    ]);
    expect(smile).toEqual([
      { strike: 100, iv: 25, type: "call" },
      { strike: 100, iv: 30, type: "put" },
    ]);
  });
});

describe("structural proximity", () => {
  it("flags gamma flip within 0.2%", () => {
    expect(isWithinPctBand(100, 100.15, 0.2)).toBe(true);
    expect(
      detectStructuralProximity({
        ticker: "SPY",
        spotPrice: 100,
        gammaFlip: 100.15,
        putWall: 95,
        callWall: 105,
      })?.alertType,
    ).toBe("GAMMA_FLIP_COLLISION");
  });

  it("flags wall strike collisions", () => {
    expect(matchesWallStrike(100, 100.2)).toBe(true);
    expect(
      detectStructuralProximity({
        ticker: "SPY",
        spotPrice: 100,
        gammaFlip: 90,
        putWall: 100,
        callWall: 110,
      })?.alertType,
    ).toBe("PUT_WALL_COLLISION");
  });
});

describe("buildWebhookPayload", () => {
  it("includes alert label and dashboard path", () => {
    const payload = buildWebhookPayload({
      ticker: "spy",
      scorePct: 82,
      alert: {
        ticker: "SPY",
        alertType: "GAMMA_FLIP_COLLISION",
        spotPrice: 100,
        level: 100.1,
        distancePct: -0.1,
      },
    });
    expect(payload.alertType).toContain("GAMMA FLIP");
    expect(payload.dashboardUrl).toContain("/ticker/SPY");
    expect(payload.scorePct).toBe(82);
  });
});
