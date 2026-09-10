/** Scanner universe modes for PreMove confluence discovery. */
export type ScanMode = "swing" | "penny";

export const PENNY_MAX_PRICE = 1;
export const PENNY_MIN_PRICE = 0.05;

export interface ScanModeConfig {
  label: string;
  strategy: string;
  /** UW screener max_underlying_price (undefined = no cap). */
  maxUnderlyingPrice?: string;
  minUnderlyingPrice?: string;
  minNetCallPremium: string;
  /** Minimum flow-alert premium ($) to count as unusual. */
  minFlowPremium: number;
  /** Minimum total options premium for bullish-flow signal. */
  minBullishPremium: number;
  /** Minimum call-sweep premium for aggressive-flow signal. */
  minAggressivePremium: number;
  minOiChangePerc: string;
  /** Relative stock volume vs 30d avg (penny liquidity/heat filter). */
  minStockVolumeVsAvg30?: string;
  issueTypes?: string;
}

export const SCAN_MODE_CONFIG: Record<ScanMode, ScanModeConfig> = {
  swing: {
    label: "Swing Trade Setups",
    strategy: "multi-bucket-quality-v2",
    minNetCallPremium: "250000",
    minFlowPremium: 100_000,
    minBullishPremium: 250_000,
    minAggressivePremium: 100_000,
    minOiChangePerc: "5",
  },
  penny: {
    label: "Penny Stocks Under $1",
    strategy: "penny-under-1-v1",
    maxUnderlyingPrice: String(PENNY_MAX_PRICE),
    minUnderlyingPrice: String(PENNY_MIN_PRICE),
    // Sub-$1 names rarely print $250k premium — lower the bar, keep confluence.
    minNetCallPremium: "10000",
    minFlowPremium: 15_000,
    minBullishPremium: 25_000,
    minAggressivePremium: 15_000,
    minOiChangePerc: "5",
    minStockVolumeVsAvg30: "1.5",
    issueTypes: "Common Stock",
  },
};

export function parseScanMode(value: string | null | undefined): ScanMode {
  return value === "penny" ? "penny" : "swing";
}

/** True when a known price is within the penny universe (inclusive of max). */
export function isPennyPrice(price: number | null | undefined): boolean {
  if (price === null || price === undefined || !Number.isFinite(price)) return false;
  return price >= PENNY_MIN_PRICE && price <= PENNY_MAX_PRICE;
}
