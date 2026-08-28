import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ApiKeyProvider } from "@/lib/api-key-context";
import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PreMove Scanner — Quant Data Confluence",
  description:
    "Catch stocks before the big move. Multi-layer confluence scanner powered by Quant Data API.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <ApiKeyProvider>
          <Nav />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
