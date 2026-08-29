import type { Metadata, Viewport } from "next";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden bg-zinc-950 text-zinc-100">
        <ApiKeyProvider>
          <Nav />
          <main className="mx-auto w-full max-w-lg px-4 py-6 sm:max-w-7xl sm:px-6">{children}</main>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
