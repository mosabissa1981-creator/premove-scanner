import { describe, expect, it } from "vitest";
import { rebaseProfileAtFlip } from "@/utils/gamma-math";

describe("rebaseProfileAtFlip", () => {
  it("anchors profile at zero on the gamma flip price", () => {
    const raw = [
      { x: 240, raw: -20_000_000 },
      { x: 248.42, raw: 0 },
      { x: 265, raw: 183_000_000 },
      { x: 270, raw: 103_000_000 },
    ];
    const rebased = rebaseProfileAtFlip(
      raw.map((point) => point.x),
      raw.map((point) => point.raw),
      248.42,
    );
    const atFlip = rebased.find((point) => Math.abs(point.x - 248.42) < 0.01);
    expect(atFlip?.profile ?? rebased[1]?.profile).toBeCloseTo(0, 0);
  });

  it("does not stack bar-sized dollar values into a billion-dollar cliff", () => {
    const rebased = rebaseProfileAtFlip(
      [240, 248.42, 260, 265, 270],
      [-20_000_000, 0, 50_000_000, 183_000_000, 103_000_000],
      248.42,
    );
    const at265 = rebased.find((point) => point.x === 265)?.profile ?? 0;
    const at270 = rebased.find((point) => point.x === 270)?.profile ?? 0;
    expect(at265).toBeCloseTo(183_000_000, -3);
    expect(at270).toBeCloseTo(103_000_000, -3);
    expect(at270).toBeLessThan(500_000_000);
  });
});
