/**
 * Curated US tickers that often trade under ~$5.
 * Live scan still filters by current Yahoo price (≤ $5).
 * No options / no paid API — price & volume only.
 */
export const CHEAP_STOCK_UNIVERSE: string[] = [
  // Uranium / mining / metals
  "DNN",
  "UUUU",
  "UEC",
  "URG",
  "NG",
  "NAK",
  "GLDG",
  "SILV",
  "EQX",
  "AG",
  "HL",
  "CDE",
  "EXK",
  "FSM",
  "IAG",
  "EGO",
  "SBSW",
  "BTG",
  "NGD",
  "MUX",
  // Energy / clean / EV-ish names that rotate cheap
  "PLUG",
  "FCEL",
  "BEEM",
  "CHPT",
  "BLNK",
  "OPTT",
  "AMPY",
  "TELL",
  "CLNE",
  "PBF",
  // Biotech / healthcare smalls
  "OCGN",
  "INO",
  "VXRT",
  "BNGO",
  "ATOS",
  "CLOV",
  "SENS",
  "NVAX",
  "AVXL",
  "ABUS",
  "ADMA",
  "CRMD",
  "KPTI",
  // Tech / speculative / growth that often dips under $5
  "SOUN",
  "BBAI",
  "OPEN",
  "RGTI",
  "QBTS",
  "QUBT",
  "ACHR",
  "JOBY",
  "SPCE",
  "RKLB",
  "ASTS",
  "LUNR",
  "PL",
  "SNAP",
  "SOFI",
  "LCID",
  "RIVN",
  "NIO",
  "XPEV",
  // Retail / meme / misc often cheap
  "SIRI",
  "AMC",
  "BB",
  "NOK",
  "MARA",
  "RIOT",
  "BITF",
  "HUT",
  "CLSK",
  "CIFR",
  "CAN",
  "BTBT",
  // ADRs / consumer / cannabis
  "IQ",
  "HUYA",
  "GRAB",
  "SNDL",
  "CGC",
  "TLRY",
  "ACB",
  "OGI",
  "CRON",
  "PENN",
  "FUBO",
  "PTON",
  "BYND",
  "MAXN",
  "RUN",
  "NOVA",
  "ARRY",
];

export const CHEAP_MAX_PRICE = 5;
export const CHEAP_MIN_PRICE = 0.05;

export type CheapBand = "all" | "under1" | "oneToFive";

export function parseCheapBand(value: string | null | undefined): CheapBand {
  if (value === "under1" || value === "oneToFive") return value;
  return "all";
}

export function priceInBand(price: number, band: CheapBand): boolean {
  if (!Number.isFinite(price)) return false;
  if (price < CHEAP_MIN_PRICE || price > CHEAP_MAX_PRICE) return false;
  if (band === "under1") return price < 1;
  if (band === "oneToFive") return price >= 1 && price <= CHEAP_MAX_PRICE;
  return true;
}
