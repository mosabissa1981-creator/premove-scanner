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
- **API:** Cloudflare Worker (`worker/index.ts` + `/api/*` routes)
- **Deploy:** Cloudflare Workers Builds (`scorch-hot-sectors` project)

## Local development

```bash
npm install

# Terminal 1 — API (Worker + static assets)
npm run build && npx wrangler dev --port 8788

# Terminal 2 — Vite dev server (proxies /api to wrangler)
npm run dev
```

Or test the sectors builder directly:

```bash
npx tsx scripts/smoke-sectors.ts
```

## Deploy to Cloudflare

```bash
npm run build
npm run deploy
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
5. Build command: `npm run build` · Deploy command: `npx wrangler deploy`

**Option B — monorepo (this repo)**

1. Merge the `scorch-hot/` folder into `premove-scanner` (or keep on a branch)
2. Connect Cloudflare to `premove-scanner` with **Root directory** = `scorch-hot`
3. Build command: `npm run build` · Deploy command: `npm run deploy` (or `npx wrangler deploy` when root is `scorch-hot`)
4. **Branch control:** enable “Builds for non-production branches” so PR checks run preview builds

Future pushes auto-deploy — no more manual `wrangler deploy`.

## Environment variables (optional)

| Variable | Purpose |
|----------|---------|
| `VAPID_PUBLIC_KEY` | Web push notifications |

Set in Cloudflare Dashboard → project → Settings → Environment variables.

## Disclaimer

Educational and research purposes only. Not financial advice.
