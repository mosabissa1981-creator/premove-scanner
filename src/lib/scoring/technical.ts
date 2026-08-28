import type { UwCandle } from "@/lib/unusualwhales/types";

export interface PriceBar {
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
}

export function toPriceBars(candles: UwCandle[]): PriceBar[] {
  return candles
    .map((c) => ({
      openPrice: parseFloat(c.open),
      highPrice: parseFloat(c.high),
      lowPrice: parseFloat(c.low),
      closePrice: parseFloat(c.close),
    }))
    .filter((b) => !Number.isNaN(b.closePrice));
}

export function calculateCoilScore(bars: PriceBar[]): number {
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

export function calculatePriceChangePct(bars: PriceBar[]): number {
  if (bars.length < 2) return 0;
  const first = bars[0].closePrice;
  const last = bars[bars.length - 1].closePrice;
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

export function getResistanceLevel(bars: PriceBar[]): number | null {
  if (bars.length < 10) return null;
  return Math.max(...bars.slice(-10).map((b) => b.highPrice));
}

export function getSwingStop(bars: PriceBar[]): number | null {
  if (bars.length < 10) return null;
  return Math.min(...bars.slice(-10).map((b) => b.lowPrice));
}

export function isNearResistance(bars: PriceBar[]): boolean {
  if (bars.length < 10) return false;
  const recent = bars.slice(-10);
  const highs = recent.map((b) => b.highPrice);
  const current = bars[bars.length - 1].closePrice;
  const resistance = Math.max(...highs);
  if (resistance === 0) return false;
  const distance = (resistance - current) / resistance;
  return distance >= 0 && distance <= 0.02;
}
