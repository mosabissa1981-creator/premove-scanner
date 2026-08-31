import { describe, expect, it } from "vitest";
import { formatMoney, formatPrice, gexRegimeBadge } from "@/lib/format";

describe("formatMoney", () => {
  it("formats billions, millions, and thousands", () => {
    expect(formatMoney(2_500_000_000)).toBe("$2.50B");
    expect(formatMoney(-1_200_000)).toBe("-$1.20M");
    expect(formatMoney(4500)).toBe("$4.5K");
  });

  it("returns em dash for nullish values", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });
});

describe("formatPrice", () => {
  it("formats strike prices", () => {
    expect(formatPrice(769.41)).toBe("$769.41");
    expect(formatPrice(null)).toBe("—");
  });
});

describe("gexRegimeBadge", () => {
  it("labels regimes for GEX pages", () => {
    expect(gexRegimeBadge("positive").label).toBe("Above flip");
    expect(gexRegimeBadge("negative").label).toBe("Below flip");
    expect(gexRegimeBadge("neutral").label).toBe("Neutral");
    expect(gexRegimeBadge("neutral", { neutralLabel: "No flip" }).label).toBe("No flip");
  });
});
