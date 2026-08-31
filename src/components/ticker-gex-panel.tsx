"use client";

import { TickerTerminal } from "@/components/ticker-terminal";
import type { GexStudyResult } from "@/lib/unusualwhales/types";

export function TickerGexPanel({ study }: { study: GexStudyResult }) {
  return <TickerTerminal ticker={study.ticker} initialStudy={study} />;
}
