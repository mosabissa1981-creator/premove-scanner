"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApiKey } from "@/lib/api-key-context";

const links = [
  { href: "/", label: "Scanner" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const { hasKey } = useApiKey();

  return (
    <>
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-black">
              PM
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">PreMove Scanner</div>
              <div className="text-[10px] text-zinc-500">Unusual Whales Confluence</div>
            </div>
          </Link>

          <Link
            href="/settings"
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 transition ${
              hasKey
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-red-500/30 bg-red-500/10"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${hasKey ? "bg-emerald-500" : "bg-red-500"}`}
            />
            <span className={`text-xs font-medium ${hasKey ? "text-emerald-300" : "text-red-300"}`}>
              {hasKey ? "API connected" : "Add API key"}
            </span>
          </Link>
        </div>

        <nav className="flex border-t border-zinc-800 sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 py-2.5 text-center text-xs font-medium transition ${
                pathname === link.href
                  ? "bg-zinc-800 text-emerald-400"
                  : "text-zinc-400"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <nav className="mx-auto hidden max-w-7xl gap-1 px-4 pb-2 sm:flex sm:px-6">
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
