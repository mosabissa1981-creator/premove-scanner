import { describe, it, expect } from "vitest";
import {
  aggregateGex,
  filterAndSortGexRows,
  filterByGammaFlip,
  gexSides,
  parseTickers,
  ratioLabel,
  resolveMonthlyExpiry,
  selectExpiryRows,
  thirdFridayOfMonth,
  ymd,
} from "@/lib/gex-scan/gex-scan";
import type { UwGreekExposureExpiryRow } from "@/lib/unusualwhales/types";

const rows: UwGreekExposureExpiryRow[] = [
  { call_gex: "100", put_gex: "-40", expiry: "2026-08-29", dte: 0 },
  { call_gex: "200", put_gex: "-80", expiry: "2026-09-05", dte: 7 },
  { call_gex: "500", put_gex: "-100", expiry: "2026-09-19", dte: 21 },
];

describe("parseTickers", () => {
  it("dedupes and normalizes symbols", () => {
    expect(parseTickers("nvda, AAPL\nTSLA NVDA")).toEqual(["NVDA", "AAPL", "TSLA"]);
  });

  it("strips exchange prefixes", () => {
    expect(parseTickers("NASDAQ:MSFT")).toEqual(["MSFT"]);
  });
});

describe("selectExpiryRows", () => {
  it("picks 0DTE for daily mode", () => {
    const selected = selectExpiryRows(rows, "daily");
    expect(selected).toHaveLength(1);
    expect(selected[0].expiry).toBe("2026-08-29");
  });

  it("picks the weekly Friday expiry", () => {
    const now = new Date("2026-08-28T15:00:00");
    const selected = selectExpiryRows(rows, "weekly", now);
    expect(selected[0].expiry).toBe("2026-08-29");
  });

  it("sums all rows for all mode", () => {
    expect(selectExpiryRows(rows, "all")).toHaveLength(3);
  });
});

describe("aggregateGex", () => {
  it("sums call, put, and net gex", () => {
    const agg = aggregateGex(rows.slice(0, 2));
    expect(agg.callGex).toBe(300);
    expect(agg.putGex).toBe(-120);
    expect(agg.netGex).toBe(180);
    expect(agg.expiry).toBe("all");
  });
});

describe("ratio helpers", () => {
  it("labels call-heavy imbalance", () => {
    const row = { callGex: 300, putGex: -100 };
    expect(ratioLabel(row)).toBe("3 : 1");
    expect(gexSides(row).callHeavy).toBe(true);
  });

  it("labels put-heavy imbalance", () => {
    const row = { callGex: 50, putGex: -200 };
    expect(ratioLabel(row)).toBe("1 : 4");
    expect(gexSides(row).callHeavy).toBe(false);
  });

  it("filters and sorts by imbalance", () => {
    const results = filterAndSortGexRows(
      [
        {
          ticker: "A",
          source: "unusual-whales",
          expiry: "all",
          callGex: 100,
          putGex: -50,
          netGex: 50,
          dominant: "CALL",
          callWall: null,
          putWall: null,
          gammaFlip: 100,
          gammaMagnet: null,
          stockPrice: 105,
          regime: "positive",
          flipDistancePct: 4.76,
          ratio: "2 : 1",
          imbalance: 2,
        },
        {
          ticker: "B",
          source: "unusual-whales",
          expiry: "all",
          callGex: 300,
          putGex: -100,
          netGex: 200,
          dominant: "CALL",
          callWall: null,
          putWall: null,
          gammaFlip: 120,
          gammaMagnet: null,
          stockPrice: 110,
          regime: "negative",
          flipDistancePct: -8.33,
          ratio: "3 : 1",
          imbalance: 3,
        },
      ],
      2,
    );
    expect(results.map((r) => r.ticker)).toEqual(["B", "A"]);
  });

  it("filters by gamma flip regime", () => {
    const rows = [
      {
        ticker: "A",
        source: "unusual-whales" as const,
        expiry: "all",
        callGex: 100,
        putGex: -50,
        netGex: 50,
        dominant: "CALL" as const,
        callWall: null,
        putWall: null,
        gammaFlip: 100,
        gammaMagnet: null,
        stockPrice: 105,
        regime: "positive" as const,
        flipDistancePct: 4.76,
        ratio: "2 : 1",
        imbalance: 2,
      },
      {
        ticker: "B",
        source: "unusual-whales" as const,
        expiry: "all",
        callGex: 300,
        putGex: -100,
        netGex: 200,
        dominant: "CALL" as const,
        callWall: null,
        putWall: null,
        gammaFlip: 120,
        gammaMagnet: null,
        stockPrice: 110,
        regime: "negative" as const,
        flipDistancePct: -8.33,
        ratio: "3 : 1",
        imbalance: 3,
      },
    ];
    expect(filterByGammaFlip(rows, "above").map((r) => r.ticker)).toEqual(["A"]);
    expect(filterByGammaFlip(rows, "below").map((r) => r.ticker)).toEqual(["B"]);
    expect(filterByGammaFlip(rows, "near")).toEqual([]);
  });
});

describe("resolveMonthlyExpiry", () => {
  it("returns the third Friday of the month", () => {
    const now = new Date("2026-08-10T12:00:00");
    expect(resolveMonthlyExpiry(now)).toBe(ymd(thirdFridayOfMonth(2026, 7)));
  });
});
