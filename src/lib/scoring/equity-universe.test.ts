import { describe, expect, it } from "vitest";
import {
  filterOptionsEquityTickers,
  isBlockedOptionsVehicle,
} from "@/lib/scoring/equity-universe";

describe("isBlockedOptionsVehicle", () => {
  it("blocks mega index and bond ETFs from the screenshot noise set", () => {
    expect(isBlockedOptionsVehicle("MBB")).toBe(true);
    expect(isBlockedOptionsVehicle("RSP")).toBe(true);
    expect(isBlockedOptionsVehicle("EFA")).toBe(true);
    expect(isBlockedOptionsVehicle("SPY")).toBe(true);
    expect(isBlockedOptionsVehicle("TLT")).toBe(true);
    expect(isBlockedOptionsVehicle("QQQ")).toBe(true);
  });

  it("keeps single-name equities like AVGO", () => {
    expect(isBlockedOptionsVehicle("AVGO")).toBe(false);
    expect(isBlockedOptionsVehicle("CRWV")).toBe(false);
    expect(isBlockedOptionsVehicle("AAPL")).toBe(false);
  });
});

describe("filterOptionsEquityTickers", () => {
  it("drops blocked vehicles from a mixed candidate list", () => {
    const rows = [{ ticker: "AVGO" }, { ticker: "MBB" }, { ticker: "RSP" }, { ticker: "NVDA" }];
    expect(filterOptionsEquityTickers(rows).map((r) => r.ticker)).toEqual(["AVGO", "NVDA"]);
  });
});
