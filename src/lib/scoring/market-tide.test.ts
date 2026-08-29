import { describe, it, expect } from "vitest";
import { interpretMarketTide } from "@/lib/scoring/market-tide";

describe("interpretMarketTide", () => {
  it("reads bullish when net call premium dominates", () => {
    const view = interpretMarketTide([
      { net_call_premium: "10000000", net_put_premium: "9000000" },
      { net_call_premium: "100000000", net_put_premium: "20000000" },
    ]);
    expect(view?.sentiment).toBe("bullish");
    expect(view?.netCallPremium).toBe(100000000);
  });

  it("reads bearish when net put premium dominates", () => {
    const view = interpretMarketTide([{ net_call_premium: "10000000", net_put_premium: "100000000" }]);
    expect(view?.sentiment).toBe("bearish");
  });

  it("reads neutral for a small imbalance", () => {
    const view = interpretMarketTide([{ net_call_premium: "51000000", net_put_premium: "50000000" }]);
    expect(view?.sentiment).toBe("neutral");
  });

  it("returns null for empty data", () => {
    expect(interpretMarketTide([])).toBeNull();
  });
});
