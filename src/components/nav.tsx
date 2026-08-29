"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApiKey } from "@/lib/api-key-context";

const links = [
  { href: "/", label: "Scanner", shortLabel: "Scan" },
  { href: "/watchlist", label: "Watchlist", shortLabel: "List" },
  { href: "/backtest", label: "Backtest", shortLabel: "Test" },
  { href: "/settings", label: "Settings", shortLabel: "Set" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const { hasKey } = useApiKey();

  return (
    <>
      <header className="w-full min-w-0 overflow-x-clip border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="flex w-full min-w-0 items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-black">
              PM
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">PreMove Scanner</div>
              <div className="hidden text-[10px] text-zinc-500 sm:block">Unusual Whales Confluence</div>
            </div>
          </Link>

          <Link
            href="/settings"
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 transition sm:gap-2 sm:px-3 ${
              hasKey
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-red-500/30 bg-red-500/10"
            }`}
            aria-label={hasKey ? "API connected" : "Add API key"}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${hasKey ? "bg-emerald-500" : "bg-red-500"}`}
            />
            <span
              className={`hidden text-xs font-medium sm:inline ${hasKey ? "text-emerald-300" : "text-red-300"}`}
            >
              {hasKey ? "API connected" : "Add API key"}
            </span>
          </Link>
        </div>

        <nav className="flex w-full min-w-0 border-t border-zinc-800 sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`min-w-0 flex-1 px-0.5 py-2.5 text-center text-[11px] font-medium leading-tight transition ${
                pathname === link.href
                  ? "bg-zinc-800 text-emerald-400"
                  : "text-zinc-400"
              }`}
            >
              {link.shortLabel}
            </Link>
          ))}
        </nav>
      </header>

      <nav className="hidden w-full gap-1 px-4 pb-2 sm:flex sm:px-6">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              pathname === link.href
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
