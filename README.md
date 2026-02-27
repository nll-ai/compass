# Compass

Compass is a lightweight competitive intelligence monitoring system for small biotech teams.

## Quick Start

1. Copy `.env.example` to `.env.local` and populate values.
2. Install dependencies:
   - `npm install`
3. **Auth (WorkOS)**: Configure [WorkOS AuthKit](https://workos.com/docs/user-management/nextjs) and set `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD` (min 32 chars), and `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (e.g. `http://localhost:3000/callback`). In the WorkOS dashboard set Redirect URI, Sign-in redirect, and Sign-out redirect. Generate a JWT key pair for Convex: run `node scripts/generate-jwt-keys.mjs`, add the printed private key to `.env.local` as `CONVEX_JWT_PRIVATE_KEY`, and ensure `convex/jwks-public.json` (or the inlined JWKS in `convex/auth.config.ts`) is in sync. Set `CONVEX_JWT_ISSUER` and `CONVEX_JWT_AUDIENCE` in the Convex dashboard if you override the defaults.
4. Start development server:
   - `npm run dev`

## Available Scripts

- `npm run dev` - start Next.js development server
- `npm run build` - build production bundle
- `npm run start` - run production server
- `npm run lint` - run lint checks
- `npm run typecheck` - run TypeScript checks

## Scan & digest pipeline

- **Run a scan**: Dashboard "Run scan now", watch target detail "Run scan for this watch target", or Setup step 3. These call `POST /api/scan`, which runs all source scanners and digest generation **in your app** using keys from `.env.local` (so local dev works without Convex env vars).
- **Crons**: Optional (e.g. Vercel cron); can call `POST /api/scan` with `Authorization: Bearer <SCAN_SECRET>` and body `{ "period": "daily" }`.

### Manual scan (local dev)

1. In `.env.local` set **`SCAN_SECRET`** (any non-empty string) and your API keys:
   - `OPENAI_API_KEY` – for digest generation (LLM summary).
   - `EXA_API_KEY` – optional; adds web-search results from Exa (otherwise Exa returns 0 items).
   - `PUBMED_API_KEY` – optional; higher PubMed rate limit.
   - `PATENTSVIEW_API_KEY` – optional; [PatentsView](https://patentsview.org/) API key for US patent search (request via their help center).
2. Run `npm run dev` and open the app. Click **Run scan now** on the dashboard. The scan runs in your Next.js server and uses the keys above; results show up in the dashboard.

### Sources (what actually runs)

| Source            | Wired | Notes |
|-------------------|-------|--------|
| PubMed           | Yes   | No key = 3 req/s; add `PUBMED_API_KEY` for 10 req/s. |
| ClinicalTrials.gov| Yes   | No API key needed. |
| SEC EDGAR         | Yes   | 10-K/10-Q filings; matches targets by company name/ticker via SEC company list (no key). |
| Exa              | Yes   | Add `EXA_API_KEY` in `.env.local` to get web results; otherwise 0 items. |
| Patents           | Yes   | Add `PATENTSVIEW_API_KEY` for US patent search; otherwise 0 items. |
| openFDA, RSS      | Stubbed | Return 0 items until implemented. |

Digest items and scan results include **links to original sources** (SEC filing, patent, PubMed, trial, etc.) so you can open the source in one click.

### Scans show 0 items?

- Ensure you have at least one **active watch target** (Setup or Watch Targets).
- **`.env.local`**: set `EXA_API_KEY` (and optionally `PUBMED_API_KEY`) so more sources return results. PubMed and ClinicalTrials work without keys and often return items.
- First run often finds items; later runs dedupe by `externalId`, so "new" counts can be 0 if nothing new appeared.

## Running locally vs Convex cloud

**Production Convex deployment:** Convex functions for the deployed app run at [https://careful-frog-794.convex.cloud](https://careful-frog-794.convex.cloud). Set `NEXT_PUBLIC_CONVEX_URL` to that URL in your hosting env (e.g. Vercel) for production.

If Convex is working **locally** (backend at `http://127.0.0.1:3210` or similar), your project is using a **local deployment**. To move to Convex’s cloud:

1. **Switch to a cloud dev deployment** (so `npx convex dev` syncs to the cloud instead of running the backend on your machine):
   - Run: `npx convex disable-local-deployments`
   - Then run: `npx convex dev`
   - Convex will use (or create) a cloud dev deployment and update `.env.local` with the new `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`. Your app will then talk to Convex in the cloud.

2. **Deploy to production** (when you’re ready to ship):
   - Run: `npx convex deploy`
   - This pushes your `convex/` code to the project’s **production** deployment. Use that deployment’s URL for your production app (e.g. set `NEXT_PUBLIC_CONVEX_URL` in your hosting env).

3. **Environment variables in the cloud**: For any **cloud** deployment (dev or prod), set API keys in the [Convex dashboard](https://dashboard.convex.dev) → your deployment → **Settings → Environment Variables** (`OPENAI_API_KEY`, `EXA_API_KEY`, etc.). Local deployments don’t use the dashboard’s env vars; cloud deployments do.

## Deploying to Vercel

1. **Connect the repo**: In [Vercel](https://vercel.com), sign in, click **Add New… → Project**, and import your Compass GitHub repo. Vercel will detect Next.js; leave **Build Command** as `next build` and **Output Directory** as default.

2. **Environment variables**: In the Vercel project → **Settings → Environment Variables**, add the following (for **Production**; add for Preview too if you want preview deployments to use Convex production or a separate dev deployment):

   | Variable | Notes |
   |----------|--------|
   | `NEXT_PUBLIC_CONVEX_URL` | `https://careful-frog-794.convex.cloud` (production Convex) |
   | `CONVEX_JWT_PRIVATE_KEY` | Same as in `.env.local` (full PEM, including `\n` if you paste multi-line) |
   | `SCAN_SECRET` | Same value as in Convex dashboard env vars (so `/api/scan` can authenticate) |
   | `NEXT_PUBLIC_APP_URL` | Your Vercel URL, e.g. `https://compassci.vercel.app` |
   | WorkOS | `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (use your production callback URL, e.g. `https://compassci.vercel.app/callback`) |
   | Auth allowlist | `AUTH_ALLOWED_DOMAINS`, `AUTH_ALLOWED_EMAILS` (same as local if desired) |
   | Optional (for scan/digest) | `OPENAI_API_KEY`, `EXA_API_KEY`, `PUBMED_API_KEY`, etc. — only if you run scans from the deployed app; otherwise scans can be triggered by cron with secrets. |

   In WorkOS dashboard, add your Vercel domain to Redirect URIs (e.g. `https://compassci.vercel.app/callback`, sign-in/sign-out URLs).

3. **Deploy**: Push to your main branch or click **Redeploy** in Vercel. The first build may take a couple of minutes. After deploy, open your Vercel URL and sign in to confirm Convex and auth work.

## Authentication

Compass uses [WorkOS AuthKit](https://workos.com/docs/user-management/nextjs) for sign-in and sessions. The app issues its own short-lived JWTs for Convex so the backend can enforce identity and scope data by user. All watch targets, digest runs, and scan runs are scoped to the signed-in user. The scan pipeline (`POST /api/scan`) still uses `SCAN_SECRET` and does not require a user session; it writes scan data for the targets it is given. Redirect URIs and sign-in/sign-out URLs must be configured in the [WorkOS dashboard](https://dashboard.workos.com/). By default only emails/domains in `AUTH_ALLOWED_DOMAINS` and `AUTH_ALLOWED_EMAILS` can sign in; set `AUTH_ALLOWLIST_ENABLED=false` to allow any user who signs in via WorkOS (Google, Microsoft, etc.). Existing data before auth was added has no `userId`; you can backfill to a default user or treat legacy rows as unowned until assigned.
