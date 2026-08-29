# PreMove Scanner

A multi-layer **pre-move confluence scanner** powered by the [Unusual Whales API](https://unusualwhales.com/public-api). Finds stocks **before** big moves using flat price + hidden call flow + dark pool buildup.

## Live app

Deploy to [Vercel](https://vercel.com) (recommended):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/premove-scanner)

Or run locally:

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Settings** → paste your Unusual Whales API key.

## Project location

All source code lives in this repository:

```
premove-scanner/
├── src/
│   ├── app/           # Pages + API routes
│   ├── components/    # UI components
│   └── lib/           # UW client, scoring engine
├── public/setup.html  # Mobile-friendly API key page
└── package.json
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | PreMove scanner — find early swing setups |
| `/gex-scan` | GEX ratio scanner — call vs put gamma exposure |
| `/settings` | Save Unusual Whales API key |
| `/setup.html` | Plain HTML key entry (works on iPhone) |
| `/watchlist` | Saved tickers |
| `/ticker/[SYMBOL]` | Single ticker deep dive |

## API routes

- `GET /api/scan?limit=20` — Run confluence scan
- `POST /api/gex-scan` — Run GEX call:put ratio scan (body: `{ tickers, expiry }`)
- `GET /api/ticker/AAPL` — Single ticker analysis
- `POST /api/settings/save` — Save API key (cookie)
- `GET /api/config` — Check if key is configured

## Environment variables

Optional server-side key (so users don't need to paste on each device):

```
UNUSUAL_WHALES_API_KEY=your_bearer_token
```

## Unusual Whales API

Sign up at [unusualwhales.com/public-api](https://unusualwhales.com/public-api)

- API Trial: ~$50/week
- API Basic: $150/mo after trial

## Disclaimer

Educational and research purposes only. Not financial advice.
