import type { ReactNode } from "react";

/** Keeps all pages within the phone viewport — prevents horizontal pan/scroll. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[100dvw] overflow-x-clip sm:max-w-7xl">
      {children}
    </div>
  );
}
