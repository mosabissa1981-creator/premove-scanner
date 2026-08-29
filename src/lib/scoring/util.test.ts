import { describe, it, expect } from "vitest";
import { clamp01, gradedFactor, ramp } from "@/lib/scoring/util";

describe("clamp01", () => {
  it("clamps into [0,1]", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
  });
});

describe("ramp", () => {
  it("is 0 at/below lo and 1 at/above hi with linear middle", () => {
    expect(ramp(10, 20, 40)).toBe(0);
    expect(ramp(20, 20, 40)).toBe(0);
    expect(ramp(30, 20, 40)).toBe(0.5);
    expect(ramp(40, 20, 40)).toBe(1);
    expect(ramp(50, 20, 40)).toBe(1);
  });

  it("handles a zero-width range", () => {
    expect(ramp(5, 5, 5)).toBe(1);
    expect(ramp(4, 5, 5)).toBe(0);
  });
});

describe("gradedFactor", () => {
  it("floors at the given floor and scales to 1", () => {
    expect(gradedFactor(0)).toBeCloseTo(0.4);
    expect(gradedFactor(1)).toBeCloseTo(1);
    expect(gradedFactor(0.5)).toBeCloseTo(0.7);
    expect(gradedFactor(0.5, 0)).toBeCloseTo(0.5);
  });
});
