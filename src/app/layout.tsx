import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ApiKeyProvider } from "@/lib/api-key-context";
import { AppShell } from "@/components/app-shell";
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
  title: "PreMove Scanner — Unusual Whales Confluence",
  description:
    "Catch stocks before the big move. Multi-layer confluence scanner powered by Unusual Whales API.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-clip antialiased`}
    >
      <body className="min-h-full overflow-x-clip bg-zinc-950 text-zinc-100">
        <ApiKeyProvider>
          <AppShell>
            <Nav />
            <main className="w-full min-w-0 px-4 py-6 sm:px-6">{children}</main>
          </AppShell>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
