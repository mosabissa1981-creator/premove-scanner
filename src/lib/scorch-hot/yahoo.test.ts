import { describe, expect, it } from "vitest";
import { pctChange, round } from "./yahoo";

describe("scorch-hot yahoo helpers", () => {
  it("computes percent change", () => {
    expect(round(pctChange(100, 110), 2)).toBe(10);
  });
});
