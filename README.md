# PreMove Scanner

A multi-layer **pre-move confluence scanner** powered by the [Unusual Whales API](https://unusualwhales.com/public-api). Finds stocks before big moves using flat price action, hidden call flow, dark pool buildup, and gamma exposure context.

**Live app:** [premove-scanner-iaah.vercel.app](https://premove-scanner-iaah.vercel.app)

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Settings** → paste your Unusual Whales API key.

Or deploy to [Vercel](https://vercel.com) and set `UNUSUAL_WHALES_API_KEY` in project env vars.

## What it does

| Feature | Route | Description |
|---------|-------|-------------|
| **PreMove Scanner** | `/` | Multi-signal confluence scan (coil, flow, dark pool, IV, GEX, earnings) |
| **GEX Scan** | `/gex-scan` | Call vs put gamma exposure ratio across a ticker list |
| **GEX Study** | `/gex-study/[ticker]` | Per-ticker gamma exposure chart (bars + profile, walls, flip) |
| **Scorch Hot** | `/scorch-hot` | Sector/theme heat ranked by momentum |
| **Watchlist** | `/watchlist` | Saved tickers with live re-analysis |
| **Backtest** | `/backtest` | Historical signal forward-return evaluation |
| **Ticker detail** | `/ticker/[symbol]` | Single-ticker confluence deep dive |
| **Settings** | `/settings` | API key (cookie + localStorage) |
| **Mobile setup** | `/setup.html` | Plain HTML key entry for iPhone |

## API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/scan` | GET | Run PreMove confluence scan |
| `/api/gex-scan` | POST | GEX ratio scan (`{ tickers, expiry }`) |
| `/api/gex-study` | GET | Full GEX study for one ticker |
| `/api/ticker/[symbol]` | GET | Single-ticker analysis |
| `/api/scorch-hot` | GET | Sector/theme heat data |
| `/api/watchlist` | POST | Re-analyze watchlist tickers |
| `/api/backtest` | GET | Historical backtest |
| `/api/market-tide` | GET | Market tide snapshot |
| `/api/config` | GET | Check if API key is configured |
| `/api/test-key` | GET | Validate API key |
| `/api/settings` | GET/POST/DELETE | API key management |

## Project structure

```
premove-scanner/
├── src/
│   ├── app/              # Next.js pages + API routes
│   ├── components/       # UI (gex-strike-chart, nav, ticker-search, …)
│   ├── lib/
│   │   ├── unusualwhales/   # UW API client
│   │   ├── scoring/         # PreMove confluence engine
│   │   ├── gex-scan/        # Multi-ticker GEX scanner
│   │   ├── gex-study/       # GEX study + BS gamma simulation
│   │   ├── scorch-hot/      # Sector heat (embedded in Next app)
│   │   └── backtest/
│   └── utils/
│       ├── gamma-math.ts    # Flip-anchored profile math
│       └── chart-domain.ts  # Dual-axis chart scales
├── scorch-hot/           # Standalone Cloudflare Worker (optional deploy)
├── public/setup.html
└── scripts/build.mjs     # Routes to Next or Scorch Hot build
```

## GEX chart stack

The GEX Study chart (`/gex-study/[ticker]`) uses a custom dual-axis SVG chart:

- **Bars (left axis):** Net GEX per strike from Unusual Whales spot/greek exposure
- **Profile line (right axis):** Cumulative gamma profile rebased to $0 at gamma flip
- **Simulation:** When option chain data is available, Black-Scholes spot simulation drives a smooth profile curve (`gamma-profile-sim.ts`)
- **Reference lines:** Put wall, gamma flip, call wall, current spot

Shared utilities: `src/utils/gamma-math.ts`, `src/utils/chart-domain.ts`, `src/lib/gex-study/gex-chart-ui.ts`, `src/lib/gex-study/gex-chart-viewport.ts`.

## Environment variables

```bash
# Required for server-side auth (optional if users paste key in Settings)
UNUSUAL_WHALES_API_KEY=your_bearer_token
```

API key can also be set per-user via Settings page (cookie `uw_api_key` or localStorage `premove_uw_api_key`), or passed as `x-uw-api-key` header.

### Scorch Hot (Cloudflare Worker only)

```bash
VAPID_PUBLIC_KEY=   # Web push notifications
```

See `scorch-hot/README.md` for standalone Worker deploy.

## Unusual Whales API

Sign up at [unusualwhales.com/public-api](https://unusualwhales.com/public-api)

- API Trial: ~$50/week
- API Basic: $150/mo after trial

This app calls `api.unusualwhales.com` — it does not run inside unusualwhales.com.

## Development

```bash
npm test          # 146 unit tests (vitest)
npm run build     # Next.js production build
npm run lint      # ESLint
```

CI runs `npm test` + `npm run build` on push/PR to `main`. Only `main` auto-deploys to Vercel (`cursor/*` branches are suppressed in `vercel.json`).

## Disclaimer

Educational and research purposes only. Not financial advice.
