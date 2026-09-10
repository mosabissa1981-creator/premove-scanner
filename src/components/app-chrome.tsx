"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ApiKeyProvider } from "@/lib/api-key-context";
import { AppShell } from "@/components/app-shell";
import { Nav } from "@/components/nav";

/**
 * PreMove chrome (nav + API key) for the main product.
 * Standalone apps under /movers get zero PreMove UI.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isStandaloneMovers = pathname === "/movers" || pathname.startsWith("/movers/");

  if (isStandaloneMovers) {
    return <>{children}</>;
  }

  return (
    <ApiKeyProvider>
      <AppShell>
        <Nav />
        <main className="w-full min-w-0 px-4 py-6 sm:px-6">{children}</main>
      </AppShell>
    </ApiKeyProvider>
  );
}
