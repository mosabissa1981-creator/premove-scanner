# PreMove Scanner

A multi-layer **pre-move confluence scanner** powered by the [Unusual Whales API](https://unusualwhales.com/public-api). Catches stocks before big moves by combining volatility coils, dark pool accumulation, options flow, IV anomalies, and GEX levels.

## What it does

| Layer | Signal | Unusual Whales endpoint |
|-------|--------|-------------------------|
| 1 — Coil | Volatility compression (BB squeeze) | `/api/stock/{ticker}/ohlc/1d` |
| 1 — Accumulation | Dark pool buildup | `/api/darkpool/{ticker}` |
| 2 — Conviction | Bullish flow / sweeps | Stock screener + flow alerts |
| 2 — IV anomaly | IV rising while price flat | `/api/stock/{ticker}/iv-rank` |
| 3 — Technical | Near resistance breakout | OHLC history |
| 4 — Amplify | GEX flip proximity | `/api/stock/{ticker}/gex-levels` |

**Score 6+** = High conviction watchlist  
**Score 4–5** = Medium  
**Score 2–3** = Watch

## Setup (free trial)

1. Sign up for the **Unusual Whales API trial** at [unusualwhales.com/public-api](https://unusualwhales.com/public-api)
   - API Trial: ~$50/week (or free trial when offered)
   - API Basic after trial: **$150/mo**
2. Copy your Bearer API token from the dashboard
3. Install and run:

```bash
npm install
cp .env.example .env.local
# Add: UNUSUAL_WHALES_API_KEY=your_token
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) → **Settings** → paste key → **Run Scan**

## Pages

- **/** — Run confluence scan on top options activity
- **/ticker/[SYMBOL]** — Deep dive on one ticker
- **/watchlist** — Saved tickers
- **/settings** — API key configuration

## API routes

- `GET /api/scan?limit=15&minPremium=1000000` — Full confluence scan
- `GET /api/ticker/AAPL` — Single ticker analysis
- `GET /api/config` — Check server key status

Pass `x-uw-api-key` header to override env key.

## Rate limits (API Basic)

- 40,000 requests/day
- 120 requests/minute
- A scan of 15 tickers uses ~90 API calls

## Disclaimer

This tool is for educational and research purposes only. Not financial advice.
