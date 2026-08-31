import { describe, expect, it } from "vitest";
import {
  resolveBottomBadgeLayout,
  resolveLineLabelLayouts,
} from "@/lib/gex-study/gex-chart-ui";

describe("resolveLineLabelLayouts", () => {
  it("rotates labels vertically by default", () => {
    const layouts = resolveLineLabelLayouts([{ key: "flip", x: 200 }]);
    expect(layouts[0]?.rotate).toBe(-90);
    expect(layouts[0]?.dx).toBe(0);
  });

  it("splits adjacent labels when lines are closer than 5px", () => {
    const layouts = resolveLineLabelLayouts([
      { key: "put", x: 100 },
      { key: "flip", x: 103 },
    ]);
    const put = layouts.find((layout) => layout.key === "put");
    const flip = layouts.find((layout) => layout.key === "flip");
    expect(put?.dx).toBe(-12);
    expect(flip?.dx).toBe(12);
  });

  it("splits labels when rotated footprint would overlap", () => {
    const layouts = resolveLineLabelLayouts(
      [
        { key: "put", x: 100 },
        { key: "flip", x: 118 },
      ],
      { labelFontSize: 20 },
    );
    const put = layouts.find((layout) => layout.key === "put");
    const flip = layouts.find((layout) => layout.key === "flip");
    expect(put?.dx).toBe(-12);
    expect(flip?.dx).toBe(12);
  });

  it("leaves well-spaced labels untouched", () => {
    const layouts = resolveLineLabelLayouts([
      { key: "put", x: 80 },
      { key: "flip", x: 200 },
      { key: "call", x: 320 },
    ]);
    expect(layouts.every((layout) => layout.dx === 0)).toBe(true);
  });
});

describe("resolveBottomBadgeLayout", () => {
  it("nudges overlapping badges horizontally before stacking rows", () => {
    const badges = resolveBottomBadgeLayout(
      [
        { key: "put", x: 200, text: "125", color: "#f00" },
        { key: "flip", x: 210, text: "117", color: "#fa0" },
      ],
      360,
      { minSpacingPx: 52 },
    );
    expect(badges).toHaveLength(2);
    const put = badges.find((badge) => badge.key === "put");
    const flip = badges.find((badge) => badge.key === "flip");
    expect(put?.y).toBe(360);
    expect(flip?.y).toBe(360);
    expect(Math.abs((put?.x ?? 0) - (flip?.x ?? 0))).toBeGreaterThan(20);
  });

  it("merges duplicate strike text badges", () => {
    const badges = resolveBottomBadgeLayout(
      [
        { key: "a", x: 150, text: "117", color: "#fa0" },
        { key: "b", x: 280, text: "117", color: "#fa0" },
      ],
      360,
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]?.text).toBe("117");
  });

  it("spreads coincident badge anchors horizontally", () => {
    const badges = resolveBottomBadgeLayout(
      [
        { key: "put", x: 200, text: "125.00", color: "#f00" },
        { key: "flip", x: 200, text: "117.00", color: "#fa0" },
      ],
      360,
      { minSpacingPx: 52 },
    );
    expect(badges).toHaveLength(2);
    expect(Math.abs(badges[0]!.x - badges[1]!.x)).toBeGreaterThan(30);
  });
});
