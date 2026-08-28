# PreMove Scanner

A multi-layer **pre-move confluence scanner** powered by the [Quant Data API](https://quantdata.us/api). Catches stocks before big moves by combining volatility coils, dark pool accumulation, options flow, IV anomalies, and GEX levels.

## What it does

| Layer | Signal | Source |
|-------|--------|--------|
| 1 — Coil | Volatility compression (BB squeeze) | Stock Price Over Time |
| 1 — Accumulation | Dark pool buildup | Dark Flow |
| 2 — Conviction | Bullish options premium / sweeps | Gainers/Losers + Order Flow |
| 2 — IV anomaly | IV rising while price flat | IV Rank |
| 3 — Technical | Near resistance breakout | Price history |
| 4 — Amplify | GEX flip proximity | Exposure By Strike |

**Score 6+** = High conviction watchlist  
**Score 4–5** = Medium  
**Score 2–3** = Watch

## Setup

1. Get a Quant Data API key from [quantdata.us/api](https://quantdata.us/api) ($125–150/mo)
2. Install dependencies:

```bash
npm install
```

3. Create `.env.local`:

```env
QUANTDATA_API_KEY=your_key_here
```

4. Run the dev server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

You can also enter your API key in **Settings** (stored in browser localStorage).

## Pages

- **/** — Run confluence scan on top options activity
- **/ticker/[SYMBOL]** — Deep dive on one ticker
- **/watchlist** — Saved tickers
- **/settings** — API key configuration

## API routes

- `GET /api/scan?limit=15&minPremium=1000000` — Full confluence scan
- `GET /api/ticker/AAPL` — Single ticker analysis
- `GET /api/config` — Check server key status

Pass `x-quantdata-api-key` header to override env key.

## Rate limits

Quant Data allows 240 requests/min. A full scan of 15 tickers uses ~90 API calls and takes 1–3 minutes.

## Disclaimer

This tool is for educational and research purposes only. Not financial advice.
