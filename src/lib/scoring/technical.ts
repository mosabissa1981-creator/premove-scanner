import type { StockPriceBucket } from "@/lib/quantdata/types";

export function calculateCoilScore(bars: StockPriceBucket[]): number {
  if (bars.length < 20) return 0;

  const closes = bars.map((b) => b.closePrice);
  const recent = closes.slice(-20);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance =
    recent.reduce((sum, price) => sum + (price - mean) ** 2, 0) / recent.length;
  const stdDev = Math.sqrt(variance);

  const bandWidth = mean > 0 ? (stdDev * 4) / mean : 1;

  const historicalWidths: number[] = [];
  for (let i = 20; i <= closes.length; i++) {
    const window = closes.slice(i - 20, i);
    const wMean = window.reduce((a, b) => a + b, 0) / window.length;
    const wVar =
      window.reduce((sum, price) => sum + (price - wMean) ** 2, 0) / window.length;
    const wStd = Math.sqrt(wVar);
    if (wMean > 0) historicalWidths.push((wStd * 4) / wMean);
  }

  if (historicalWidths.length === 0) return 0;

  const minWidth = Math.min(...historicalWidths);
  const maxWidth = Math.max(...historicalWidths);
  const range = maxWidth - minWidth;

  if (range === 0) return 50;

  const compression = 1 - (bandWidth - minWidth) / range;
  return Math.round(Math.max(0, Math.min(100, compression * 100)));
}

export function calculatePriceChangePct(bars: StockPriceBucket[]): number {
  if (bars.length < 2) return 0;
  const first = bars[0].closePrice;
  const last = bars[bars.length - 1].closePrice;
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

export function isNearResistance(bars: StockPriceBucket[]): boolean {
  if (bars.length < 10) return false;
  const recent = bars.slice(-10);
  const highs = recent.map((b) => b.highPrice);
  const current = bars[bars.length - 1].closePrice;
  const resistance = Math.max(...highs);
  if (resistance === 0) return false;
  const distance = (resistance - current) / resistance;
  return distance >= 0 && distance <= 0.02;
}
