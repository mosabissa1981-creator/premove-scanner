/** Shared display formatters for GEX pages and stats tables. */

export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

export function signedClass(value: number): string {
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

export function gexRegimeBadge(
  regime: "positive" | "negative" | "neutral",
  options: { neutralLabel?: string } = {},
): { label: string; className: string } {
  if (regime === "positive") {
    return {
      label: "Above flip",
      className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (regime === "negative") {
    return {
      label: "Below flip",
      className: "border-red-500/40 bg-red-500/15 text-red-300",
    };
  }
  return {
    label: options.neutralLabel ?? "Neutral",
    className: "border-zinc-700 bg-zinc-800 text-zinc-400",
  };
}
