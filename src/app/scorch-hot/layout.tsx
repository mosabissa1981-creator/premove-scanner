import { Archivo_Black, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./scorch-hot.css";

const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-scorch-display",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-scorch-body",
});

export default function ScorchHotLayout({ children }: { children: ReactNode }) {
  return <div className={`${display.variable} ${body.variable}`}>{children}</div>;
}
