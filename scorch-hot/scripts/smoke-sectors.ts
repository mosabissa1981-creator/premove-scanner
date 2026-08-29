#!/usr/bin/env npx tsx
import { buildSectorsPayload } from "../shared/sectors";

const payload = await buildSectorsPayload();
console.log(JSON.stringify({
  headline: payload.headline,
  leader: payload.dayBoard[0]?.name,
  themes: payload.themes.length,
  stocks: payload.stocks.slice(0, 3).map((s) => s.ticker),
  source: payload.source,
}, null, 2));
