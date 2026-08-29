import { describe, it, expect } from "vitest";
import {
  candleDate,
  forwardReturnFromDate,
  summarizeBacktest,
  toDatedBars,
  type BacktestRow,
  type DatedBar,
} from "@/lib/backtest/backtest";

describe("candleDate / toDatedBars", () => {
  it("extracts and sorts dated closes, dropping invalid rows", () => {
    const bars = toDatedBars([
      { open: "1", high: "1", low: "1", close: "12", date: "2026-08-20" },
      { open: "1", high: "1", low: "1", close: "10", start_time: "2026-08-18T00:00:00Z" },
      { open: "1", high: "1", low: "1", close: "bad", date: "2026-08-19" },
    ]);
    expect(bars.map((b) => b.date)).toEqual(["2026-08-18", "2026-08-20"]);
    expect(bars[0].close).toBe(10);
  });

  it("returns null for a candle with no usable date", () => {
    expect(candleDate({ open: "1", high: "1", low: "1", close: "1" })).toBeNull();
  });
});

describe("forwardReturnFromDate", () => {
  const bars: DatedBar[] = [
    { date: "2026-08-10", close: 100 },
    { date: "2026-08-11", close: 101 },
    { date: "2026-08-12", close: 110 },
    { date: "2026-08-13", close: 121 },
  ];

  it("computes percent return over the horizon", () => {
    expect(forwardReturnFromDate(bars, "2026-08-10", 2)).toBeCloseTo(10); // 100 -> 110
  });

  it("uses the first bar on/after the entry date", () => {
    expect(forwardReturnFromDate(bars, "2026-08-10", 3)).toBeCloseTo(21); // 100 -> 121
  });

  it("returns null when there isn't enough forward data", () => {
    expect(forwardReturnFromDate(bars, "2026-08-13", 2)).toBeNull();
    expect(forwardReturnFromDate(bars, "2026-09-01", 1)).toBeNull();
  });
});

describe("summarizeBacktest", () => {
  it("computes win rate, averages, and per-source breakdown", () => {
    const rows: BacktestRow[] = [
      { ticker: "A", source: "flat-call", entryClose: 10, forwardReturn: 5 },
      { ticker: "B", source: "flat-call", entryClose: 10, forwardReturn: -3 },
      { ticker: "C", source: "oi-change", entryClose: 10, forwardReturn: 9 },
      { ticker: "D", source: "oi-change", entryClose: null, forwardReturn: null },
    ];
    const s = summarizeBacktest(rows);
    expect(s.picks).toBe(4);
    expect(s.evaluated).toBe(3);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.avgReturn).toBeCloseTo(3.67, 1);
    expect(s.bySource["oi-change"].evaluated).toBe(1);
    expect(s.bySource["oi-change"].winRate).toBe(1);
  });
});
