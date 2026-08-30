export interface SleeveDef {
  id: string;
  kind: "sector" | "theme";
  etf: string;
  name: string;
  blurb: string;
  names: string[];
}

export const SECTOR_DEFS: SleeveDef[] = [
  { id: "xlc", kind: "sector", etf: "XLC", name: "Communication Services", blurb: "GICS sector", names: ["META", "GOOGL", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "EA", "CHTR"] },
  { id: "xly", kind: "sector", etf: "XLY", name: "Consumer Discretionary", blurb: "GICS sector", names: ["AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "CMG"] },
  { id: "xle", kind: "sector", etf: "XLE", name: "Energy", blurb: "GICS sector", names: ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "WMB", "OXY"] },
  { id: "xlp", kind: "sector", etf: "XLP", name: "Consumer Staples", blurb: "GICS sector", names: ["PG", "COST", "WMT", "KO", "PEP", "PM", "MDLZ", "CL", "MO", "TGT"] },
  { id: "xlf", kind: "sector", etf: "XLF", name: "Financials", blurb: "GICS sector", names: ["JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "C", "AXP", "BRK.B"] },
  { id: "xlb", kind: "sector", etf: "XLB", name: "Materials", blurb: "GICS sector", names: ["LIN", "SHW", "APD", "ECL", "FCX", "NEM", "CTVA", "DOW", "DD", "NUE"] },
  { id: "xlv", kind: "sector", etf: "XLV", name: "Health Care", blurb: "GICS sector", names: ["UNH", "LLY", "JNJ", "ABBV", "MRK", "TMO", "ABT", "PFE", "AMGN", "DHR"] },
  { id: "xlre", kind: "sector", etf: "XLRE", name: "Real Estate", blurb: "GICS sector", names: ["PLD", "AMT", "EQIX", "WELL", "SPG", "O", "CCI", "DLR", "PSA", "VICI"] },
  { id: "xli", kind: "sector", etf: "XLI", name: "Industrials", blurb: "GICS sector", names: ["GE", "CAT", "RTX", "UNP", "HON", "ETN", "BA", "DE", "LMT", "UPS"] },
  { id: "xlu", kind: "sector", etf: "XLU", name: "Utilities", blurb: "GICS sector", names: ["NEE", "SO", "DUK", "CEG", "AEP", "SRE", "D", "EXC", "PEG", "XEL"] },
  { id: "xlk", kind: "sector", etf: "XLK", name: "Technology", blurb: "GICS sector", names: ["AAPL", "MSFT", "NVDA", "AVGO", "CRM", "ORCL", "ADBE", "AMD", "CSCO", "ACN"] },
];

export const THEME_DEFS: SleeveDef[] = [
  { id: "cloud", kind: "theme", etf: "SKYY", name: "Cloud", blurb: "Theme basket", names: ["AMZN", "MSFT", "GOOGL", "ORCL", "CRM"] },
  { id: "bitcoin", kind: "theme", etf: "IBIT", name: "Bitcoin", blurb: "Theme basket", names: ["MSTR", "COIN", "MARA", "RIOT", "CLSK"] },
  { id: "quantum", kind: "theme", etf: "QTUM", name: "Quantum", blurb: "Theme basket", names: ["IBM", "GOOGL", "IONQ", "RGTI", "QBTS"] },
  { id: "semiconductors", kind: "theme", etf: "SMH", name: "Semiconductors", blurb: "Theme basket", names: ["NVDA", "AVGO", "TSM", "AMD", "ASML"] },
  { id: "aviation", kind: "theme", etf: "JETS", name: "Aviation", blurb: "Theme basket", names: ["DAL", "UAL", "AAL", "LUV", "BA"] },
  { id: "space", kind: "theme", etf: "UFO", name: "Space", blurb: "Theme basket", names: ["RKLB", "ASTS", "LUNR", "PL", "BA"] },
];

export const BOARD_DEFS: SleeveDef[] = [...SECTOR_DEFS, ...THEME_DEFS];

export const STOCK_COMPANY: Record<string, string> = {
  META: "Meta", GOOGL: "Alphabet", NFLX: "Netflix", DIS: "Disney", CMCSA: "Comcast", T: "AT&T", VZ: "Verizon", TMUS: "T-Mobile", EA: "EA", CHTR: "Charter",
  AMZN: "Amazon", TSLA: "Tesla", HD: "Home Depot", MCD: "McDonald's", NKE: "Nike", LOW: "Lowe's", SBUX: "Starbucks", TJX: "TJX", BKNG: "Booking", CMG: "Chipotle",
  XOM: "Exxon Mobil", CVX: "Chevron", COP: "ConocoPhillips", SLB: "Schlumberger", EOG: "EOG Resources", MPC: "Marathon Petroleum", PSX: "Phillips 66", VLO: "Valero", WMB: "Williams", OXY: "Occidental",
  PG: "Procter & Gamble", COST: "Costco", WMT: "Walmart", KO: "Coca-Cola", PEP: "PepsiCo", PM: "Philip Morris", MDLZ: "Mondelez", CL: "Colgate", MO: "Altria", TGT: "Target",
  JPM: "JPMorgan Chase", BAC: "Bank of America", WFC: "Wells Fargo", GS: "Goldman Sachs", MS: "Morgan Stanley", BLK: "BlackRock", SCHW: "Charles Schwab", C: "Citigroup", AXP: "American Express", "BRK.B": "Berkshire Hathaway",
  LIN: "Linde", SHW: "Sherwin-Williams", APD: "Air Products", ECL: "Ecolab", FCX: "Freeport", NEM: "Newmont", CTVA: "Corteva", DOW: "Dow", DD: "DuPont", NUE: "Nucor",
  UNH: "UnitedHealth", LLY: "Eli Lilly", JNJ: "Johnson & Johnson", ABBV: "AbbVie", MRK: "Merck", TMO: "Thermo Fisher", ABT: "Abbott", PFE: "Pfizer", AMGN: "Amgen", DHR: "Danaher",
  PLD: "Prologis", AMT: "American Tower", EQIX: "Equinix", WELL: "Welltower", SPG: "Simon", O: "Realty Income", CCI: "Crown Castle", DLR: "Digital Realty", PSA: "Public Storage", VICI: "VICI",
  GE: "GE Aerospace", CAT: "Caterpillar", RTX: "RTX", UNP: "Union Pacific", HON: "Honeywell", ETN: "Eaton", BA: "Boeing", DE: "Deere", LMT: "Lockheed", UPS: "UPS",
  NEE: "NextEra", SO: "Southern", DUK: "Duke", CEG: "Constellation", AEP: "AEP", SRE: "Sempra", D: "Dominion", EXC: "Exelon", PEG: "PSEG", XEL: "Xcel",
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", AVGO: "Broadcom", CRM: "Salesforce", ORCL: "Oracle", ADBE: "Adobe", AMD: "AMD", CSCO: "Cisco", ACN: "Accenture",
  MSTR: "MicroStrategy", COIN: "Coinbase", MARA: "Marathon Digital", RIOT: "Riot", CLSK: "CleanSpark",
  IBM: "IBM", IONQ: "IonQ", RGTI: "Rigetti", QBTS: "D-Wave",
  TSM: "TSMC", ASML: "ASML",
  DAL: "Delta", UAL: "United", AAL: "American", LUV: "Southwest",
  RKLB: "Rocket Lab", ASTS: "AST SpaceMobile", LUNR: "Intuitive Machines", PL: "Planet Labs",
};

export const STOCK_SECTOR: Record<string, string> = {
  AAPL: "Technology", MSFT: "Technology", NVDA: "Technology", AVGO: "Technology", CRM: "Technology", ORCL: "Technology", ADBE: "Technology", AMD: "Technology", CSCO: "Technology", ACN: "Technology",
  JPM: "Financials", BAC: "Financials", WFC: "Financials", GS: "Financials", MS: "Financials", BLK: "Financials", SCHW: "Financials", C: "Financials", AXP: "Financials", "BRK.B": "Financials",
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy", EOG: "Energy", MPC: "Energy", PSX: "Energy", VLO: "Energy", WMB: "Energy", OXY: "Energy",
};
