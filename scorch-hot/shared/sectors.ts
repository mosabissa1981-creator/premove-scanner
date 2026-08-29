import { BOARD_DEFS, SECTOR_DEFS, STOCK_COMPANY, STOCK_SECTOR, THEME_DEFS, type SleeveDef } from "./universe";
import { fetchQuotes, type QuoteSlice, round } from "./yahoo";

export interface StockRow {
  ticker: string;
  company: string;
  sector?: string;
  price: number;
  change1d: number;
  change1w: number;
  change1m: number;
  change3m: number;
  heat: number;
  spark: number[];
  rank: number;
  label: string;
}

export interface SleeveRow {
  id: string;
  kind: "sector" | "theme";
  etf: string;
  ticker: string;
  key: string;
  name: string;
  blurb: string;
  names: string[];
  price: number;
  change1d: number;
  change1w: number;
  change1m: number;
  change3m: number;
  vsSpy1d: number;
  vsSpy1m: number;
  heat: number;
  breadth: { rising: number; total: number };
  topMovers: StockRow[];
  spark: number[];
  tone: "up" | "down" | "flat";
  stocks: StockRow[];
  rank: number;
  label: string;
}

export interface IdeaNote {
  id: string;
  kind: "leader" | "breadth" | "rotation" | "weakness";
  brand: string;
  title: string;
  headline: string;
  bullets: Array<{ icon: string; text: string }>;
  summary?: string;
  footer: string;
  timestamp: string;
}

export interface SectorsPayload {
  generatedAt: string;
  asOf: string;
  benchmark: QuoteSlice & { ticker: string };
  headline: string;
  stockHeadline: string;
  analysis: string;
  rotation: { into: Array<{ id: string; name: string; etf: string; change1d: number }>; outOf: Array<{ id: string; name: string; etf: string; change1d: number }> };
  highlights: string[];
  smartAlert: {
    brand: string;
    title: string;
    headline: string;
    bullets: Array<{ icon: string; text: string }>;
    timestamp: string;
  };
  leaderAlert: Record<string, unknown>;
  ideaNotes: IdeaNote[];
  dayBoard: SleeveRow[];
  sectors: SleeveRow[];
  themes: SleeveRow[];
  stocks: StockRow[];
  source: string;
  cached: boolean;
}

function heatLabel(change1d: number, heat: number): string {
  if (change1d >= 1.2 || heat >= 6) return "Blazing";
  if (change1d >= 0.8 || heat >= 4) return "Hot";
  if (change1d >= 0.4 || heat >= 2) return "Warming";
  if (change1d <= -1.5 || heat <= -4) return "Cooling";
  if (change1d <= -0.5 || heat <= -1.5) return "Neutral";
  return "Steady heat";
}

function sleeveHeat(quote: QuoteSlice, spy: QuoteSlice): number {
  const vs1d = quote.change1d - spy.change1d;
  const vs1w = quote.change1w - spy.change1w;
  const vs1m = quote.change1m - spy.change1m;
  const vs3m = quote.change3m - spy.change3m;
  return round(vs1m * 0.31 + vs1w * 0.1 + vs1d * 0.14 + vs3m * 0.05, 3);
}

function stockHeat(quote: QuoteSlice, spy: QuoteSlice): number {
  const denom = Math.max(Math.abs(spy.change1m), 0.5);
  return round((quote.change1m / denom) * 1.55 + (quote.change1w - spy.change1w) * 0.04, 3);
}

function stockRow(ticker: string, quote: QuoteSlice, spy: QuoteSlice): StockRow {
  return {
    ticker,
    company: STOCK_COMPANY[ticker] ?? ticker,
    sector: STOCK_SECTOR[ticker],
    price: quote.price,
    change1d: quote.change1d,
    change1w: quote.change1w,
    change1m: quote.change1m,
    change3m: quote.change3m,
    heat: stockHeat(quote, spy),
    spark: quote.spark,
    rank: 0,
    label: "",
  };
}

function buildSleeve(def: SleeveDef, etfQuote: QuoteSlice, spy: QuoteSlice, stockQuotes: Map<string, QuoteSlice>): SleeveRow {
  const stocks = def.names
    .map((ticker) => {
      const q = stockQuotes.get(ticker);
      return q ? stockRow(ticker, q, spy) : null;
    })
    .filter((row): row is StockRow => row !== null)
    .sort((a, b) => b.change1d - a.change1d);

  const rising = stocks.filter((s) => s.change1d > 0).length;
  const heat = sleeveHeat(etfQuote, spy);

  return {
    id: def.id,
    kind: def.kind,
    etf: def.etf,
    ticker: def.etf,
    key: def.kind === "theme" ? def.id : def.etf,
    name: def.name,
    blurb: def.blurb,
    names: def.names,
    price: etfQuote.price,
    change1d: etfQuote.change1d,
    change1w: etfQuote.change1w,
    change1m: etfQuote.change1m,
    change3m: etfQuote.change3m,
    vsSpy1d: round(etfQuote.change1d - spy.change1d, 2),
    vsSpy1m: round(etfQuote.change1m - spy.change1m, 2),
    heat,
    breadth: { rising, total: stocks.length },
    topMovers: stocks.slice(0, 3),
    spark: etfQuote.spark,
    tone: etfQuote.change1d > 0.05 ? "up" : etfQuote.change1d < -0.05 ? "down" : "flat",
    stocks,
    rank: 0,
    label: heatLabel(etfQuote.change1d, heat),
  };
}

function fmtSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function asOfString(): string {
  return new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  });
}

export async function buildSectorsPayload(): Promise<SectorsPayload> {
  const allSymbols = [
    "SPY",
    ...BOARD_DEFS.map((d) => d.etf),
    ...new Set(BOARD_DEFS.flatMap((d) => d.names)),
  ];
  const quotes = await fetchQuotes(allSymbols);
  const spy = quotes.get("SPY");
  if (!spy) throw new Error("SPY benchmark unavailable");

  const dayBoard = BOARD_DEFS.map((def) => {
    const etfQuote = quotes.get(def.etf);
    if (!etfQuote) throw new Error(`${def.etf} quote unavailable`);
    return buildSleeve(def, etfQuote, spy, quotes);
  })
    .sort((a, b) => b.change1d - a.change1d)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const sectors = dayBoard.filter((r) => r.kind === "sector");
  const themes = dayBoard.filter((r) => r.kind === "theme");

  const stockMap = new Map<string, StockRow>();
  for (const def of BOARD_DEFS) {
    for (const ticker of def.names) {
      const q = quotes.get(ticker);
      if (!q || stockMap.has(ticker)) continue;
      stockMap.set(ticker, stockRow(ticker, q, spy));
    }
  }

  const stocks = [...stockMap.values()]
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 20)
    .map((row, i) => ({ ...row, rank: i + 1, label: heatLabel(row.change1d, row.heat) }));

  const leader = dayBoard[0];
  const heatLeader = [...dayBoard].sort((a, b) => b.heat - a.heat)[0];
  const weakest = [...dayBoard].sort((a, b) => a.change1d - b.change1d)[0];
  const advancing = dayBoard.filter((r) => r.change1d > 0).length;
  const declining = dayBoard.length - advancing;
  const topStock = stocks[0];

  const rotationInto = dayBoard.filter((r) => r.change1d > 0).slice(0, 3);
  const rotationOut = [...dayBoard].sort((a, b) => a.change1d - b.change1d).slice(0, 3);

  const timestamp = asOfString();
  const footer = "Scorch ranks heat vs SPY — not investment advice.";

  const ideaNotes: IdeaNote[] = [
    {
      id: `leader-${leader.id}`,
      kind: "leader",
      brand: "Scorch Hot | Sector heat",
      title: "Smart alert for important movement",
      headline: `${leader.name} is the day leader`,
      bullets: [{ icon: "rocket", text: `${leader.name} leads the day at ${fmtSigned(leader.change1d)} (ETF ${leader.etf}).` }],
      summary: `${leader.name} is outrunning the tape on a 1D basis.`,
      footer,
      timestamp,
    },
    {
      id: "breadth-session",
      kind: "breadth",
      brand: "Scorch Hot | Sector heat",
      title: "Smart alert for important movement",
      headline: "Market breadth check",
      bullets: [
        { icon: "wave", text: `Session breadth: ${advancing} advancing / ${declining} declining across sectors & themes.` },
        { icon: "chart", text: `SPY marks ${fmtSigned(spy.change1d)} as the heat benchmark.` },
      ],
      summary: `${advancing} of ${dayBoard.length} sleeves are green today.`,
      footer,
      timestamp,
    },
    {
      id: "rotation-flow",
      kind: "rotation",
      brand: "Scorch Hot | Sector heat",
      title: "Smart alert for important movement",
      headline: `Rotation into ${rotationInto[1]?.name ?? rotationInto[0]?.name ?? leader.name}`,
      bullets: [
        {
          icon: "rotate",
          text: `Into: ${rotationInto.map((r) => `${r.name} ${fmtSigned(r.change1d)}`).join(", ")}.`,
        },
        {
          icon: "down",
          text: `Out of: ${rotationOut.map((r) => `${r.name} ${fmtSigned(r.change1d)}`).join(", ")}.`,
        },
      ],
      footer,
      timestamp,
    },
    {
      id: `weak-${weakest.id}`,
      kind: "weakness",
      brand: "Scorch Hot | Sector heat",
      title: "Smart alert for important movement",
      headline: `${weakest.name} soft on the day`,
      bullets: [
        { icon: "down", text: `${weakest.name} (${weakest.etf}) is down ${fmtSigned(weakest.change1d)}.` },
        {
          icon: "chart",
          text:
            weakest.stocks.length > 0
              ? `Least weak names: ${weakest.stocks
                  .slice()
                  .sort((a, b) => b.change1d - a.change1d)
                  .slice(0, 2)
                  .map((s) => `${s.ticker} ${fmtSigned(s.change1d)}`)
                  .join(", ")}.`
              : "No constituent detail available.",
        },
      ],
      footer,
      timestamp,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    asOf: timestamp,
    benchmark: { ticker: "SPY", ...spy },
    headline: `${leader.name} leads at ${fmtSigned(leader.change1d)}`,
    stockHeadline: topStock ? `${topStock.ticker} hottest at ${fmtSigned(topStock.change1d)}` : "No stock leaders",
    analysis: `${leader.name} leads the day at ${fmtSigned(leader.change1d)}, with heat still anchored to ${heatLeader.name} versus SPY. Flow favors ${rotationInto
      .slice(0, 2)
      .map((r) => r.name)
      .join(" and ")} while ${weakest.name} lags. SPY sits at ${fmtSigned(spy.change1d)} as the session benchmark.`,
    rotation: {
      into: rotationInto.map((r) => ({ id: r.id, name: r.name, etf: r.etf, change1d: r.change1d })),
      outOf: rotationOut.map((r) => ({ id: r.id, name: r.name, etf: r.etf, change1d: r.change1d })),
    },
    highlights: [
      `Day leader: ${leader.name} ${fmtSigned(leader.change1d)}`,
      `Heat leader vs SPY: ${heatLeader.name} (heat ${heatLeader.heat})`,
      topStock ? `Hottest name: ${topStock.ticker} ${fmtSigned(topStock.change1d)}` : "No stock heat leader",
      `Rotation: into ${rotationInto[0]?.name ?? leader.name}, out of ${weakest.name}`,
      `SPY ${fmtSigned(spy.change1d)}`,
    ],
    smartAlert: {
      brand: "Scorch Hot | Sector heat",
      title: "Smart alert for important movement",
      headline: `${leader.name} is scorching the session`,
      bullets: [
        { icon: "rocket", text: `${leader.name} leads 1D at ${fmtSigned(leader.change1d)}.` },
        { icon: "chart", text: `Heat edge: ${heatLeader.name} vs SPY.` },
        { icon: "wave", text: `Benchmark SPY ${fmtSigned(spy.change1d)}.` },
        { icon: "theme", text: "Market breadth check" },
      ],
      timestamp,
    },
    leaderAlert: {
      name: leader.name,
      etf: leader.etf,
      kind: leader.kind,
      change1d: leader.change1d,
      heat: leader.heat,
      heatLeader: { name: heatLeader.name, etf: heatLeader.etf, heat: heatLeader.heat },
      topMovers: leader.topMovers,
      message: `${leader.name} is the 1D leader at ${fmtSigned(leader.change1d)}.`,
    },
    ideaNotes,
    dayBoard,
    sectors,
    themes,
    stocks,
    source: "yahoo-finance-chart-v8",
    cached: false,
  };
}
