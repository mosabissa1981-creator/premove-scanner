import type { UwMarketTideRow } from "@/lib/unusualwhales/types";

export type MarketSentiment = "bullish" | "neutral" | "bearish";

export interface MarketTideView {
  sentiment: MarketSentiment;
  label: string;
  recommendation: string;
  netCallPremium: number;
  netPutPremium: number;
}

function num(value: string | number | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value) || 0;
}

/**
 * Reduce the market-tide time series to a single sentiment read using the
 * latest cumulative net call vs put premium. Uses a proportional dead zone so
 * small imbalances read as neutral regardless of absolute market size.
 */
export function interpretMarketTide(rows: UwMarketTideRow[]): MarketTideView | null {
  if (!rows || rows.length === 0) return null;

  const last = rows[rows.length - 1];
  const netCallPremium = num(last.net_call_premium);
  const netPutPremium = num(last.net_put_premium);

  const net = netCallPremium - netPutPremium;
  const denom = Math.abs(netCallPremium) + Math.abs(netPutPremium) + 1;
  const ratio = net / denom;

  let sentiment: MarketSentiment = "neutral";
  if (ratio > 0.15) sentiment = "bullish";
  else if (ratio < -0.15) sentiment = "bearish";

  const label =
    sentiment === "bullish"
      ? "Bullish market tide"
      : sentiment === "bearish"
        ? "Bearish market tide"
        : "Neutral market tide";

  const recommendation =
    sentiment === "bullish"
      ? "Broad options flow favors longs — a tailwind for these setups."
      : sentiment === "bearish"
        ? "Broad flow is defensive — be selective with new longs."
        : "Mixed market flow — no strong directional edge today.";

  return { sentiment, label, recommendation, netCallPremium, netPutPremium };
}
