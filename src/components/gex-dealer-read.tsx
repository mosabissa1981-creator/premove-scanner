"use client";

import { useMemo } from "react";
import { buildGexDealerNarrativeFromStudy } from "@/lib/gex-study/gex-dealer-narrative";
import type { GexStudyResult } from "@/lib/unusualwhales/types";

export function GexDealerRead({ study }: { study: GexStudyResult }) {
  const narrative = useMemo(() => buildGexDealerNarrativeFromStudy(study), [study]);

  if (!narrative.bullets.length) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Dealer positioning read
        </h2>
        <p className="mt-3 text-sm text-zinc-400">{narrative.summary}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Dealer positioning read
        </h2>
        <span className="text-[10px] text-zinc-600">Simplified gamma model · not a trade signal</span>
      </div>

      <p className="mt-3 text-sm font-medium leading-relaxed text-zinc-200">{narrative.summary}</p>

      <ul className="mt-4 space-y-2.5">
        {narrative.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-sm leading-relaxed text-zinc-400">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400/80" aria-hidden />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2 border-t border-zinc-800/80 pt-4 text-xs leading-relaxed text-zinc-500">
        <p>
          <span className="font-semibold text-zinc-400">Range feel:</span> {narrative.rangeFeel}
        </p>
        <p>
          <span className="font-semibold text-zinc-400">Horizon:</span> {narrative.horizon}
        </p>
        <p>
          <span className="font-semibold text-zinc-400">Valid while:</span> {narrative.validity}
        </p>
      </div>
    </section>
  );
}
