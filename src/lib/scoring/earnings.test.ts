import { describe, it, expect } from "vitest";
import { daysUntilEarnings, isEarningsSoon } from "@/lib/scoring/earnings";

const now = new Date("2026-08-29T15:00:00Z");

describe("daysUntilEarnings", () => {
  it("returns whole days until the earnings date", () => {
    expect(daysUntilEarnings("2026-09-08", now)).toBe(10);
    expect(daysUntilEarnings("2026-08-29", now)).toBe(0);
    expect(daysUntilEarnings("2026-08-27", now)).toBe(-2);
  });

  it("returns null for missing/invalid dates", () => {
    expect(daysUntilEarnings(null, now)).toBeNull();
    expect(daysUntilEarnings(undefined, now)).toBeNull();
    expect(daysUntilEarnings("not-a-date", now)).toBeNull();
  });
});

describe("isEarningsSoon", () => {
  it("flags earnings within the window (inclusive), not past ones", () => {
    expect(isEarningsSoon(0)).toBe(true);
    expect(isEarningsSoon(12)).toBe(true);
    expect(isEarningsSoon(13)).toBe(false);
    expect(isEarningsSoon(-1)).toBe(false);
    expect(isEarningsSoon(null)).toBe(false);
  });
});
