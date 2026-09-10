import { describe, expect, it } from "vitest";
import {
  isPennyPrice,
  parseScanMode,
  PENNY_MAX_PRICE,
  SCAN_MODE_CONFIG,
} from "@/lib/scoring/scan-mode";

describe("scan-mode", () => {
  it("parses mode query values", () => {
    expect(parseScanMode("penny")).toBe("penny");
    expect(parseScanMode("swing")).toBe("swing");
    expect(parseScanMode(null)).toBe("swing");
    expect(parseScanMode("other")).toBe("swing");
  });

  it("recognizes sub-$1 prices only", () => {
    expect(isPennyPrice(0.04)).toBe(false);
    expect(isPennyPrice(0.05)).toBe(true);
    expect(isPennyPrice(0.87)).toBe(true);
    expect(isPennyPrice(PENNY_MAX_PRICE)).toBe(true);
    expect(isPennyPrice(1.01)).toBe(false);
    expect(isPennyPrice(null)).toBe(false);
  });

  it("uses lower flow thresholds for penny mode than swing", () => {
    expect(Number(SCAN_MODE_CONFIG.penny.minNetCallPremium)).toBeLessThan(
      Number(SCAN_MODE_CONFIG.swing.minNetCallPremium),
    );
    expect(SCAN_MODE_CONFIG.penny.minFlowPremium).toBeLessThan(
      SCAN_MODE_CONFIG.swing.minFlowPremium,
    );
    expect(SCAN_MODE_CONFIG.penny.maxUnderlyingPrice).toBe("1");
    expect(SCAN_MODE_CONFIG.penny.minStockVolumeVsAvg30).toBeTruthy();
  });
});
