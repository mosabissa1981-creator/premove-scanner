import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildStrikeSeries,
  computeGammaFlipFromWindow,
  summarizeStrikeSeries,
} from "@/lib/gex-study/gex-study";
import { resolveGammaFlip } from "@/lib/scoring/gex";

const snapshotPath = "/tmp/nvda-gex.json";

describe.skipIf(!existsSync(snapshotPath))("NVDA live snapshot", () => {
  it("scales greek fallback totals to spot-dollar GEX and resolves flip from nearby_flips", () => {
    const raw = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      strikes: { strike: number; callGex: number; putGex: number }[];
      stockPrice: number;
    };
    const spot = raw.stockPrice ?? 217.55;
    const rows = raw.strikes.map((s) => ({
      strike: String(s.strike),
      call_gamma_oi: String(s.callGex * spot),
      put_gamma_oi: String(s.putGex * spot),
    }));
    const series = buildStrikeSeries(rows, spot);
    const totals = summarizeStrikeSeries(series);

    expect(totals.netGex).toBeGreaterThan(1e9);
    expect(totals.callGex).toBeGreaterThan(1e9);

    const flip = resolveGammaFlip(
      {
        gamma_flip: "4.5",
        nearby_flips: ["4.5", "199.77", "210"],
        call_wall: "230",
        put_wall: "200",
        gamma_magnet: "230",
      },
      spot,
      computeGammaFlipFromWindow(series, spot),
    );

    expect(flip).not.toBeNull();
    expect(flip!).toBeGreaterThan(150);
    expect(flip!).toBeLessThan(spot);
    expect(flip!).toBeCloseTo(199.77, 0);
  });
});
