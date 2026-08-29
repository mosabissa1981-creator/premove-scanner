export type SetupPhase = "accumulation" | "conviction" | "ignition" | "amplify";

export interface SignalDetail {
  id: string;
  label: string;
  phase: SetupPhase;
  points: number;
  triggered: boolean;
  /** How strongly the signal fired, 0..1. Used for graded scoring. */
  strength: number;
  description: string;
}

export interface GexLevels {
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  gammaMagnet: number | null;
  stockPrice: number;
  regime: "positive" | "negative" | "neutral";
  flipDistancePct: number | null;
}

export interface TickerAnalysis {
  ticker: string;
  score: number;
  maxScore: number;
  tier: "ready" | "setting-up" | "early" | "watch";
  phase: SetupPhase;
  phaseLabel: string;
  action: string;
  holdTime: string;
  /** Graded score as a percentage of maxScore (0..100). */
  scorePct: number;
  resistanceLevel?: number | null;
  stopLevel?: number | null;
  earningsInDays?: number | null;
  earningsSoon?: boolean;
  oiChangePerc?: number | null;
  relativeVolume?: number | null;
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
  inFlowAlerts?: boolean;
  inCoilScreener?: boolean;
}

export interface ScanResult {
  scannedAt: string;
  candidatesScreened: number;
  results: TickerAnalysis[];
  errors: string[];
  strategy: string;
}

export interface UwCandle {
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
  total_volume?: string;
  start_time?: string;
  end_time?: string;
  date?: string;
}

export interface UwGexLevels {
  call_wall: string | null;
  put_wall: string | null;
  gamma_flip: string | null;
  gamma_magnet: string | null;
}

export interface UwOptionsVolume {
  date: string;
  bullish_premium: string;
  bearish_premium: string;
  call_premium: string;
  put_premium: string;
  net_call_premium: string;
  net_put_premium: string;
  call_volume: number;
  put_volume: number;
}

export interface UwStockScreenerRow {
  ticker: string;
  sector?: string;
  close: string;
  bullish_premium: string;
  bearish_premium: string;
  call_premium: string;
  put_premium: string;
  iv_rank?: string;
  net_call_premium?: string;
  total_oi_change_perc?: string;
  volume?: string | number;
  avg_30_day_volume?: string | number;
  next_earnings_date?: string;
  implied_move?: string;
  week_52_high?: string;
  week_52_low?: string;
  marketcap?: string;
}

export interface UwFlowAlert {
  ticker: string;
  type: string;
  total_premium: string;
  total_ask_side_prem: string;
  total_bid_side_prem: string;
  has_sweep: boolean;
  underlying_price: string;
  alert_rule?: string;
}

export interface UwDarkpoolTrade {
  ticker: string;
  premium: string;
  price: string;
  size: number;
  executed_at: string;
  nbbo_ask?: string;
  nbbo_bid?: string;
}

export interface UwIvRankRow {
  date: string;
  close: string;
  iv_rank_1y: string;
  volatility: string;
}

export interface UwStockInfo {
  full_name?: string;
  sector?: string;
  industry?: string;
  marketcap?: string;
}

export interface UwDataResponse<T> {
  data: T;
}

export interface OptionsVolumeEntry {
  bearishPremium: number;
  bullishPremium: number;
  premium: number;
  premiumRatio: number;
  tradeCount: number;
  volume: number;
}

export interface CandidateMeta {
  ticker: string;
  sector?: string;
  stockPrice?: number;
  entry: OptionsVolumeEntry;
  inCoilScreener: boolean;
  inFlowAlerts: boolean;
  /** Discovery buckets that surfaced this ticker (e.g. "flat-call", "oi-change"). */
  sources?: string[];
  nextEarnings?: string | null;
  oiChangePerc?: number | null;
  relativeVolume?: number | null;
  week52High?: number | null;
}

export interface UwMarketTideRow {
  timestamp?: string;
  date?: string;
  net_call_premium?: string | number;
  net_put_premium?: string | number;
  net_volume?: string | number;
}
