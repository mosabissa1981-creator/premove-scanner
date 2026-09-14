import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
});

import {
  getHolding,
  getHoldings,
  isBought,
  markBought,
  markSold,
} from "@/lib/alerts/holdings";
import { ALERT_ENTRIES_KEY } from "@/lib/alerts/prefs";

describe("holdings Bought/Sold", () => {
  beforeEach(() => {
    store.clear();
  });

  it("marks Bought and lists the holding", () => {
    markBought({ ticker: "amzn", entryPrice: 250, resistance: 258, note: "calls" });
    expect(isBought("AMZN")).toBe(true);
    expect(getHolding("AMZN")?.entryPrice).toBe(250);
    expect(getHoldings()).toHaveLength(1);
    const raw = store.get(ALERT_ENTRIES_KEY);
    expect(raw).toContain("AMZN");
  });

  it("Sold removes the holding", () => {
    markBought({ ticker: "QCOM", entryPrice: 180 });
    markSold("QCOM");
    expect(isBought("QCOM")).toBe(false);
    expect(getHoldings()).toHaveLength(0);
  });

  it("Bought replaces prior entry for same ticker", () => {
    markBought({ ticker: "PLTR", entryPrice: 100 });
    markBought({ ticker: "PLTR", entryPrice: 110 });
    expect(getHoldings()).toHaveLength(1);
    expect(getHolding("PLTR")?.entryPrice).toBe(110);
  });
});
