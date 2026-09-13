/**
 * Equity-only universe helpers for the options swing scanner.
 *
 * UW screener `issue_types[]=Common Stock` helps, but flow-alert feeds still
 * inject mega ETFs / bond funds. Block those explicitly so Setting Up isn't
 * dominated by SPY/QQQ/RSP/MBB-style noise.
 */

/** Broad index, sector, commodity, and bond ETFs that drown single-name flow. */
export const BLOCKED_ETF_TICKERS = new Set(
  [
    // Mega index
    "SPY",
    "SPX",
    "VOO",
    "IVV",
    "QQQ",
    "QQQM",
    "IWM",
    "IWB",
    "DIA",
    "RSP",
    // International / regional
    "EFA",
    "EEM",
    "VEA",
    "VWO",
    "IEMG",
    "VXUS",
    "IEFA",
    // Rates / credit / bond
    "TLT",
    "IEF",
    "SHY",
    "BND",
    "AGG",
    "LQD",
    "HYG",
    "JNK",
    "MBB",
    "TIP",
    "GOVT",
    "VCIT",
    "VCSH",
    "BIL",
    "SGOV",
    // Volatility / leveraged / inverse noise
    "VIX",
    "UVXY",
    "SVXY",
    "VXX",
    "TQQQ",
    "SQQQ",
    "SPXL",
    "SPXS",
    "UPRO",
    "SDS",
    "QLD",
    "QID",
    // Commodity / crypto proxies often poor for tight swing coils
    "GLD",
    "SLV",
    "USO",
    "UNG",
    "BITO",
    "IBIT",
    "FBTC",
  ].map((t) => t.toUpperCase()),
);

/** Loose ticker patterns for bond/treasury/credit ETF families. */
const BLOCKED_PREFIXES = ["TLT", "IEF", "SHY", "BND", "AGG", "LQD", "HYG", "JNK", "MBB", "TIP"];

/**
 * True when this ticker should never appear in the options-swing shortlist.
 * Conservative: only blocks known ETF/index vehicles, not every 3-letter ticker.
 */
export function isBlockedOptionsVehicle(ticker: string): boolean {
  const t = String(ticker || "")
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9.]/)[0];
  if (!t) return true;
  if (BLOCKED_ETF_TICKERS.has(t)) return true;
  // Ultra-short treasury / cash ETFs often end in these families.
  if (t.length <= 4 && BLOCKED_PREFIXES.some((p) => t === p)) return true;
  return false;
}

/** Keep only equities suitable for directional options swings. */
export function filterOptionsEquityTickers<T extends { ticker: string }>(rows: T[]): T[] {
  return rows.filter((row) => !isBlockedOptionsVehicle(row.ticker));
}
