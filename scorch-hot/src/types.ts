export interface SectorsPayload {
  generatedAt: string;
  asOf: string;
  headline: string;
  stockHeadline: string;
  analysis: string;
  highlights: string[];
  dayBoard: SleeveRow[];
  themes: SleeveRow[];
  stocks: StockRow[];
  ideaNotes: IdeaNote[];
  benchmark: { ticker: string; price: number; change1d: number };
}

export interface SleeveRow {
  id: string;
  kind: "sector" | "theme";
  etf: string;
  name: string;
  change1d: number;
  change1m: number;
  heat: number;
  label: string;
  rank: number;
  tone: "up" | "down" | "flat";
  spark: number[];
  stocks: StockRow[];
}

export interface StockRow {
  ticker: string;
  company: string;
  change1d: number;
  change1m: number;
  heat: number;
  label: string;
  rank: number;
}

export interface IdeaNote {
  id: string;
  kind: string;
  headline: string;
  bullets: Array<{ icon: string; text: string }>;
  summary?: string;
}
