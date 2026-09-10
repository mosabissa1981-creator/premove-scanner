import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./movers.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-coil-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-coil-body",
});

export const metadata: Metadata = {
  title: "Coil — Stocks Under $5 Ready to Move",
  description:
    "Free stock scanner for names under $5. Coiling price + volume heat. No API key. No options.",
};

export default function MoversLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`coil-app ${display.variable} ${body.variable}`}>
      <header className="coil-header">
        <div className="coil-brand">
          <div className="coil-mark" aria-hidden>
            C
          </div>
          <div>
            <div className="coil-brand-name">Coil</div>
            <div className="coil-brand-tag">Under $5 · Free · Stocks only</div>
          </div>
        </div>
      </header>
      <main className="coil-main">{children}</main>
      <footer className="coil-footer">
        Educational only — not financial advice. Cheap stocks carry high risk.
      </footer>
    </div>
  );
}
