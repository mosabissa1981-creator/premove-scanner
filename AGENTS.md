<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## PreMove Scanner

### Data source
All market data comes from the Unusual Whales API (`api.unusualwhales.com`). Requires `UNUSUAL_WHALES_API_KEY` or per-user key via Settings.

### Key subsystems
- **PreMove scan:** `src/lib/scoring/confluence.ts`
- **GEX scan:** `src/lib/gex-scan/gex-scan.ts`
- **GEX study + chart:** `src/lib/gex-study/gex-study.ts`, `src/components/gex-strike-chart.tsx`
- **GEX profile math:** `src/utils/gamma-math.ts` (bars), `src/lib/gex-study/gamma-profile-sim.ts` (BS simulation)
- **Chart scales/UI:** `src/utils/chart-domain.ts`, `src/lib/gex-study/gex-chart-ui.ts`, `gex-chart-viewport.ts`

### Testing
```bash
npm test        # vitest, 146 tests
npm run build   # production build
```

GEX chart changes should include unit tests in `gamma-math.test.ts`, `gex-study.test.ts`, or `gamma-profile-sim.test.ts`. UI changes to `gex-strike-chart.tsx` should be manually tested on `/gex-study/SPY`.

### Deploy
- **Vercel:** `main` branch only (see `vercel.json`)
- **Scorch Hot Worker:** `scorch-hot/` subdirectory, see `scorch-hot/README.md`

