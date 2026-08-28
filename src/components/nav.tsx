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
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-black">
              PM
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">PreMove Scanner</div>
              <div className="text-[10px] text-zinc-500">Quant Data Confluence</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
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
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${hasKey ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span className="text-xs text-zinc-500">
            {hasKey ? "API connected" : "No API key"}
          </span>
        </div>
      </div>
    </header>
  );
}
