import { describe, expect, it } from "vitest";
import type { GexStrikePoint } from "@/lib/unusualwhales/types";
import {
  applyAuthoritativeGexToSeries,
  latestSpotNetGex,
  resolveAuthoritativeGexTotals,
} from "@/lib/gex-study/authoritative-gex";

describe("resolveAuthoritativeGexTotals", () => {
  const expiryRows = [
    { expiry: "2026-09-19", dte: 21, call_gex: "30000000", put_gex: "-20000000" },
    { expiry: "2026-10-17", dte: 49, call_gex: "10000000", put_gex: "-5000000" },
  ];

  it("uses spot snapshot net for all expiries and scales call/put from the book", () => {
    const totals = resolveAuthoritativeGexTotals(
      "all",
      [
        {
          gamma_per_one_percent_move_oi: "47290000",
          price: "67.36",
          time: "2026-09-01T14:00:00Z",
        },
      ],
      expiryRows,
    );

    expect(totals).toBeDefined();
    expect(totals!.netGex).toBeCloseTo(47_290_000, 0);
    expect(totals!.callGex + totals!.putGex).toBeCloseTo(47_290_000, 0);
  });

  it("uses the expiry row for a single-expiry study", () => {
    const totals = resolveAuthoritativeGexTotals("2026-09-19", undefined, expiryRows);
    expect(totals?.callGex).toBeCloseTo(30_000_000, 0);
    expect(totals?.putGex).toBeCloseTo(-20_000_000, 0);
    expect(totals?.netGex).toBeCloseTo(10_000_000, 0);
  });
});

describe("latestSpotNetGex", () => {
  it("returns the newest snapshot row", () => {
    const net = latestSpotNetGex([
      { gamma_per_one_percent_move_oi: "1000", price: "1", time: "2026-09-01T10:00:00Z" },
      { gamma_per_one_percent_move_oi: "2500", price: "1", time: "2026-09-01T15:00:00Z" },
    ]);
    expect(net).toBe(2500);
  });
});

describe("applyAuthoritativeGexToSeries", () => {
  const bars: GexStrikePoint[] = [
    { strike: 65, callGex: 6, putGex: -4, netGex: 2, profile: 0 },
    { strike: 70, callGex: 8, putGex: -2, netGex: 6, profile: 0 },
  ];

  it("scales strike bars and keeps authoritative headline totals", () => {
    const authoritative = { callGex: 140, putGex: -60, netGex: 80 };
    const { points, totals } = applyAuthoritativeGexToSeries(bars, authoritative);

    expect(totals).toEqual(authoritative);
    expect(points[0].netGex + points[1].netGex).toBeCloseTo(80, 6);
  });
});