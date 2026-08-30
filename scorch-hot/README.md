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

Cloudflare Dashboard → **Workers & Pages** → **scorch-hot-sectors** → **Settings** → **Builds**

| Setting | Value |
|---------|-------|
| Repository | `mosabissa1981-creator/premove-scanner` |
| Production branch | `main` |
| Root directory | `scorch-hot` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Non-production branch builds | Enabled |

**Important:** this is a **Worker** project, not Cloudflare Pages. Do **not** use Pages deploy syntax such as `wrangler deploy dist --project-name ...` — that fails instantly (0-second builds).

If the dashboard shows unsaved Runtime changes (for example an empty Compatibility flags field), click **Discard** on that bar and only save **Builds** settings.

After saving, retry the failed build from **Deployments** or push a new commit.

**Monorepo alternative (repo root):** leave Root directory blank, use Build `npm run build`, Deploy `npx wrangler deploy`, and Non-production `npx wrangler versions upload`. The root `wrangler.toml` and `scripts/build.mjs` handle the `scorch-hot/` subdirectory automatically when `WORKERS_CI` is set.

Future pushes auto-deploy — no more manual `wrangler deploy`.

## Environment variables (optional)

| Variable | Purpose |
|----------|---------|
| `VAPID_PUBLIC_KEY` | Web push notifications |

Set in Cloudflare Dashboard → project → Settings → Environment variables.

## Disclaimer

Educational and research purposes only. Not financial advice.
