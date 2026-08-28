export interface GainersLosersEntry {
  bearishPremium: number;
  bullishPremium: number;
  premium: number;
  premiumRatio: number;
  tradeCount: number;
  volume: number;
}

export interface GainersLosersResponse {
  data: Record<string, GainersLosersEntry>;
}

export interface ExposureCell {
  callExposure?: number;
  putExposure?: number;
}

export interface ExposureByStrikeResponse {
  data: Record<
    string,
    {
      exposureMap: Record<string, Record<string, ExposureCell>>;
      stockPrice: number;
    }
  >;
}

export interface DarkFlowBucket {
  notionalValue: number;
  size: number;
  tradeCount: number;
  stockPrice: number;
}

export interface DarkFlowResponse {
  data: Record<string, DarkFlowBucket>;
}

export interface StockPriceBucket {
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
}

export interface StockPriceResponse {
  data: Record<string, StockPriceBucket>;
}

export interface IvLegData {
  lastIv: number;
  windowMaxIv: number;
  windowMinIv: number;
}

export interface IvRankResponse {
  expirationDates: string[];
  data: Record<
    string,
    {
      contractTypeToIVData: Record<string, IvLegData>;
      expirationDate: string;
      stockPrice: number;
    }
  >;
}

export interface NetFlowBucket {
  callSum: number;
  putSum: number;
  stockPrice?: number;
}

export interface NetFlowResponse {
  data: Record<string, NetFlowBucket>;
}

export interface MarketMapEntry {
  companyName: string;
  currentValue: number;
  previousValue: number;
  sector: string;
  industry: string;
  size: number;
}

export interface MarketMapResponse {
  data: Record<string, MarketMapEntry>;
}

export interface OrderFlowTrade {
  ticker?: string;
  tradeTime?: string;
  premium?: number;
  volume?: number;
  tradeType?: string;
  contractType?: string;
  strikePrice?: number;
  expirationDate?: string;
  tradeSideCode?: string;
}

export interface OrderFlowResponse {
  data: OrderFlowTrade[] | Record<string, OrderFlowTrade>;
}

export interface SignalDetail {
  id: string;
  label: string;
  points: number;
  triggered: boolean;
  description: string;
}

export interface GexLevels {
  netGamma: number;
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  stockPrice: number;
  regime: "positive" | "negative" | "neutral";
  flipDistancePct: number | null;
}

export interface TickerAnalysis {
  ticker: string;
  score: number;
  maxScore: number;
  tier: "high" | "medium" | "low" | "watch";
  signals: SignalDetail[];
  gex: GexLevels | null;
  premium: number;
  bullishPremium: number;
  bearishPremium: number;
  premiumRatio: number;
  darkPoolNotional: number;
  coilScore: number;
  ivRank: number | null;
  priceChangePct: number;
  sector?: string;
  companyName?: string;
  stockPrice?: number;
}

export interface ScanResult {
  scannedAt: string;
  candidatesScreened: number;
  results: TickerAnalysis[];
  errors: string[];
}
