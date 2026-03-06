# Debugging scheduled scans

When a scheduled scan doesn’t run or the scan API returns 500, follow this flow. It works the same whether Convex is **local** or **remote**; only where you read logs changes.

---

## Step 1: Confirm the schedule fired (Convex)

From the project root:

```bash
npx convex logs --history 100
```

- **No `scans:callScanApi` at the scheduled time**  
  - Cron might not be running, or the schedule didn’t match (wrong timezone/minute).  
  - Check Convex dashboard → Schedules to see if the cron runs every minute.

- **`callScanApi: APP_URL or SCAN_SECRET not set in Convex env`**  
  - Convex never calls your app. Set env in Convex:
    - **Local Convex:** `npx convex env set APP_URL http://localhost:3000` and `npx convex env set SCAN_SECRET <same-as-nextjs>` (Convex runs on your machine, so localhost works.)
    - **Remote Convex:** `APP_URL` must be a URL Convex’s cloud can reach (e.g. your Vercel URL). Same for `SCAN_SECRET`.

- **`callScanApi failed: 500 ...`**  
  - Convex did call your app; the **Next.js** `/api/scan` route threw. Go to Step 2.

- **`callScanApi failed: 401`**  
  - `SCAN_SECRET` in Convex doesn’t match the one used by your Next.js app (e.g. in `.env.local` or Vercel env).

---

## Step 2: Find the real error (Next.js)

The 500 response body from Next.js is often generic. The **actual** error and stack trace are logged server-side by the scan route and appear in the process that serves `/api/scan`:

### Local (Convex and Next.js on your machine)

1. In the terminal where **`npm run dev`** is running, look at the time when the scheduled scan ran (from Convex logs).
2. You should see a line like: **`[POST /api/scan] error: <message>`** and optionally a stack trace. That message is the root cause (e.g. missing env, exception in a source, Convex client error).
3. Fix that error (env, code, or dependency) and try again.

### Remote (Convex cloud and/or Next.js on Vercel)

1. Open your hosting dashboard (e.g. **Vercel** → your project → **Logs** or **Functions**).
2. Filter or search for `/api/scan` or the time of the scheduled run.
3. Find the log line **`[POST /api/scan] error: ...`** and the stack trace. Fix the underlying cause and redeploy if needed.

So: **Convex logs** tell you “did the schedule fire and did the API return 500?”; **Next.js logs** (dev terminal or Vercel) tell you **why** it 500’d.

---

## Step 3: Local vs remote checklist

| Scenario | Convex runs | APP_URL (in Convex env) | Where to read Next.js error |
|----------|-------------|--------------------------|-----------------------------|
| **Local Convex + local Next.js** | On your machine (`npx convex dev`) | `http://localhost:3000` (or your dev URL) | Terminal running `npm run dev` |
| **Remote Convex + local Next.js** | In Convex cloud | Public URL to your machine (e.g. ngrok tunnel) | Terminal running `npm run dev` |
| **Remote Convex + deployed Next.js** | In Convex cloud | Your app URL (e.g. `https://yourapp.vercel.app`) | Vercel (or host) function/server logs |

To see whether Convex is local or remote: check `CONVEX_DEPLOYMENT` in `.env.local`. If it starts with **`local:`** (e.g. `local:local-eric_036a4-compass`), Convex is local; otherwise it’s a cloud deployment.

---

## Quick reference

1. **Scheduled scan not firing at all** → Convex logs: cron running? Schedule time/timezone correct? `checkAndTrigger` and `callScanApi` present?
2. **callScanApi reports 500** → Next.js logs (dev terminal or Vercel): look for `[POST /api/scan] error:` and the stack.
3. **callScanApi reports 401** → Align `SCAN_SECRET` between Convex env and Next.js env.
4. **Connection/refused errors** → Convex (remote) can’t reach `APP_URL`; use a URL Convex’s network can reach (tunnel or deployed app).
