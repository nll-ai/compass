# Compass

Compass is a lightweight competitive intelligence monitoring system for small biotech teams.

## Quick Start

1. Copy `.env.example` to `.env.local` and populate values.
2. Install dependencies:
   - `npm install`
3. Start development server:
   - `npm run dev`

## Available Scripts

- `npm run dev` - start Next.js development server
- `npm run build` - build production bundle
- `npm run start` - run production server
- `npm run lint` - run lint checks
- `npm run typecheck` - run TypeScript checks

## Scan & digest pipeline

- **Run a scan**: Dashboard "Run scan now", target detail "Run scan for this target", or Setup step 3. These call `POST /api/scan`, which runs all source scanners and digest generation **in your app** using keys from `.env.local` (so local dev works without Convex env vars).
- **Crons**: Optional (e.g. Vercel cron); can call `POST /api/scan` with `Authorization: Bearer <SCAN_SECRET>` and body `{ "period": "daily" }`.

### Manual scan (local dev)

1. In `.env.local` set **`SCAN_SECRET`** (any non-empty string) and your API keys:
   - `OPENAI_API_KEY` – for digest generation (LLM summary).
   - `EXA_API_KEY` – optional; adds web-search results from Exa (otherwise Exa returns 0 items).
   - `PUBMED_API_KEY` – optional; higher PubMed rate limit.
2. Run `npm run dev` and open the app. Click **Run scan now** on the dashboard. The scan runs in your Next.js server and uses the keys above; results show up in the dashboard.

### Sources (what actually runs)

| Source            | Wired | Notes |
|-------------------|-------|--------|
| PubMed           | Yes   | No key = 3 req/s; add `PUBMED_API_KEY` for 10 req/s. |
| ClinicalTrials.gov| Yes   | No API key needed. |
| Exa              | Yes   | Add `EXA_API_KEY` in `.env.local` to get web results; otherwise 0 items. |
| EDGAR, openFDA, RSS | Stubbed | Return 0 items until implemented. |

### Scans show 0 items?

- Ensure you have at least one **active watch target** (Setup or Targets).
- **`.env.local`**: set `EXA_API_KEY` (and optionally `PUBMED_API_KEY`) so more sources return results. PubMed and ClinicalTrials work without keys and often return items.
- First run often finds items; later runs dedupe by `externalId`, so "new" counts can be 0 if nothing new appeared.

## Running locally vs Convex cloud

If Convex is working **locally** (backend at `http://127.0.0.1:3210` or similar), your project is using a **local deployment**. To move to Convex’s cloud:

1. **Switch to a cloud dev deployment** (so `npx convex dev` syncs to the cloud instead of running the backend on your machine):
   - Run: `npx convex disable-local-deployments`
   - Then run: `npx convex dev`
   - Convex will use (or create) a cloud dev deployment and update `.env.local` with the new `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`. Your app will then talk to Convex in the cloud.

2. **Deploy to production** (when you’re ready to ship):
   - Run: `npx convex deploy`
   - This pushes your `convex/` code to the project’s **production** deployment. Use that deployment’s URL for your production app (e.g. set `NEXT_PUBLIC_CONVEX_URL` in your hosting env).

3. **Environment variables in the cloud**: For any **cloud** deployment (dev or prod), set API keys in the [Convex dashboard](https://dashboard.convex.dev) → your deployment → **Settings → Environment Variables** (`OPENAI_API_KEY`, `EXA_API_KEY`, etc.). Local deployments don’t use the dashboard’s env vars; cloud deployments do.
