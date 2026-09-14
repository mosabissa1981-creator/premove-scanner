import { describe, expect, it } from "vitest";
import {
  formatBreakoutAlert,
  formatPnLAlert,
  formatReadyAlert,
  formatTelegramMessage,
} from "@/lib/alerts/format";
import type { TickerAnalysis } from "@/lib/unusualwhales/types";

function stub(partial: Partial<TickerAnalysis> & Pick<TickerAnalysis, "ticker">): TickerAnalysis {
  return {
    score: 7,
    maxScore: 10,
    tier: "ready",
    phase: "ignition",
    phaseLabel: "Ready",
    action: "Buy on breakout",
    holdTime: "1–2 weeks",
    scorePct: 70,
    resistanceLevel: 100,
    stopLevel: 90,
    signals: [],
    gex: null,
    premium: 0,
    bullishPremium: 0,
    bearishPremium: 0,
    premiumRatio: 1,
    darkPoolNotional: 0,
    coilScore: 40,
    ivRank: 30,
    priceChangePct: 5,
    stockPrice: 98,
    ...partial,
  };
}

describe("alert formatters", () => {
  it("formats Ready alerts with score and resistance", () => {
    const event = formatReadyAlert(stub({ ticker: "AMZN", stockPrice: 253.5, resistanceLevel: 258 }));
    expect(event.kind).toBe("ready");
    expect(event.title).toContain("AMZN");
    expect(event.body).toContain("Coil");
    expect(event.url).toBe("/ticker/AMZN");
  });

  it("formats breakout alerts", () => {
    const event = formatBreakoutAlert(
      stub({ ticker: "QCOM", stockPrice: 186, resistanceLevel: 185 }),
    );
    expect(event.kind).toBe("breakout");
    expect(event.body).toContain("above resistance");
  });

  it("formats P&L with sign and percent", () => {
    const event = formatPnLAlert({
      ticker: "PLTR",
      entryPrice: 100,
      livePrice: 110,
      note: "calls",
    });
    expect(event.kind).toBe("pnl");
    expect(event.title).toContain("+10.0%");
    expect(event.body).toContain("Entry");
  });

  it("escapes HTML for Telegram", () => {
    const msg = formatTelegramMessage({
      kind: "ready",
      ticker: "A",
      title: "Ready <setup>",
      body: "Buy & hold",
    });
    expect(msg).toContain("&lt;setup&gt;");
    expect(msg).toContain("&amp;");
    expect(msg).not.toContain("<setup>");
  });
});
