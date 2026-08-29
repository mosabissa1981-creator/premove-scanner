# Scorch Hot

Sector & theme heat scanner — ranks GICS sectors and theme baskets vs SPY using Yahoo Finance.

Live app: [scorch-hot.pages.dev](https://scorch-hot.pages.dev)

## What it does

- **Sector heat board** — 11 GICS ETFs + 6 theme baskets (Cloud, Semis, Bitcoin, etc.)
- **Top stocks** — hottest names by heat score
- **Smart notes** — leader, breadth, rotation, weakness alerts
- **Auto-refresh** — 1 / 5 / 15 / 30 min
- **Leader shift toasts** — optional in-app notifications

## Data source

Yahoo Finance Chart API v8 (`yahoo-finance-chart-v8`). No API key required.

## Stack

- **Frontend:** Vite + React
- **API:** Cloudflare Pages Functions (`/api/sectors`)
- **Deploy:** Cloudflare Pages (`scorch-hot-sectors` project)

## Local development

```bash
npm install

# Terminal 1 — API (Pages Functions)
npx wrangler pages dev dist --port 8788

# Terminal 2 — build once, then Vite dev server
npm run build && npm run dev
```

Or test the sectors builder directly:

```bash
npx tsx scripts/smoke-sectors.ts
```

## Deploy to Cloudflare

```bash
npm run build
npx wrangler pages deploy dist --project-name scorch-hot-sectors
```

### Connect GitHub (recommended)

**Option A — standalone repo (preferred)**

1. Create a new GitHub repo named `scorch-hot` under your account
2. From the `scorch-hot/` folder in this monorepo, push to that repo:
   ```bash
   cd scorch-hot
   git init && git add -A && git commit -m "Initial Scorch Hot"
   git remote add origin https://github.com/YOUR_USER/scorch-hot.git
   git push -u origin main
   ```
3. Cloudflare Dashboard → **Workers & Pages** → **scorch-hot-sectors**
4. **Settings** → **Builds** → Connect to GitHub → select `scorch-hot`
5. Build command: `npm run build` · Output directory: `dist`

**Option B — monorepo (this repo)**

1. Merge the `scorch-hot/` folder into `premove-scanner` (or keep on a branch)
2. Connect Cloudflare to `premove-scanner` with **Root directory** = `scorch-hot`
3. Build command: `npm run build` · Output directory: `dist`

Future pushes auto-deploy — no more manual `wrangler deploy`.

## Environment variables (optional)

| Variable | Purpose |
|----------|---------|
| `VAPID_PUBLIC_KEY` | Web push notifications |

Set in Cloudflare Dashboard → project → Settings → Environment variables.

## Disclaimer

Educational and research purposes only. Not financial advice.
