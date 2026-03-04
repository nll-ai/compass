# SEC EDGAR retrieval eval

This folder holds a **retrieval eval set** for the SEC EDGAR source: a fixed list of watch targets (public biotech/pharma companies) and a script that runs the same EDGAR retrieval code used in production, so you can inspect outputs and compare runs.

## Contents

- **`targets.json`** – Eval targets: name, displayName, company, type. Each `company` is chosen to match SEC’s company list so the procedural path (and, when configured, the agent) returns 10-K/10-Q filings.
- **`outputs/`** – Written by the runner script (see below).
  - **`latest.json`** – Full machine-readable result: run timestamp, target list, all EDGAR items (externalId, title, url, abstract, metadata, watchTargetId).
  - **`latest.md`** – Human-readable summary: one section per target with item count and a list of filing titles/links and abstract snippets.

## Prerequisites

- **SEC EDGAR:** Set `SEC_EDGAR_USER_AGENT` in `.env.local` (required for SEC requests). No API key.
- **Agent path (optional):** If `OPENAI_API_KEY` is set in `.env.local`, the script uses the EDGAR agent (LLM + full-text search); otherwise it uses the procedural company-list path only.

## How to run

From the repo root:

```bash
npm run edgar-eval
```

Run only specific target(s) by id (e.g. the Regeneron Pharmaceuticals eval):

```bash
npx tsx scripts/run-edgar-eval.ts regeneron-pharma-npr1
```

Multiple ids:

```bash
npx tsx scripts/run-edgar-eval.ts regeneron-pharma-npr1 moderna
```

With npm: `npm run edgar-eval -- regeneron-pharma-npr1` (the `--` passes the id through).

The script loads `.env.local`, reads `eval/edgar/targets.json`, builds scan targets with synthetic IDs, runs **only** the EDGAR source via `runAllSources(..., { sources: ['edgar'] })`, then writes:

- `eval/edgar/outputs/latest.json`
- `eval/edgar/outputs/latest.md`

## Inspecting outputs

- **Quick look:** Open `eval/edgar/outputs/latest.md` in an editor or viewer.
- **Per-target counts and links:** Use the same file; each `## Company` section lists filings and short abstracts.
- **Full structure / automation:** Use `eval/edgar/outputs/latest.json` (run timestamp, `edgar.items[]` with `watchTargetId`, `externalId`, `title`, `url`, `abstract`, `metadata`).

## Regeneron Pharmaceuticals eval

The eval set includes a **drug target** that uses the exact company string `"Regeneron Pharmaceuticals"` (as in the NPR1 watch target):

- **id:** `regeneron-pharma-npr1`
- **name:** NPR1
- **displayName:** NPR1 (Regeneron NPR1 agonist)
- **company:** Regeneron Pharmaceuticals
- **type:** drug

After each run, the script **asserts** that:

1. At least one EDGAR item is returned for this target.
2. Every such item has Regeneron or REGN in its title or `metadata.company`.
3. Every such item has `metadata.cik` equal to Regeneron’s CIK (`0000872589` / `872589`).

If any assertion fails, the script exits with code 1 and prints what failed. This guards against regressions where “Regeneron Pharmaceuticals” fails to resolve to REGN and the correct 10-K/10-Q filings.

## Adding or changing targets

Edit `eval/edgar/targets.json`. Each entry must have:

- `id` – short slug (e.g. `moderna`); used for synthetic `_id` and in outputs.
- `name` – e.g. ticker or program name.
- `displayName` – human label.
- `type` – `"company"` (or `"drug"` / `"target"` if you add programs).
- `company` – **Required for EDGAR.** Must match SEC’s company list (e.g. `"Moderna"`, `"Pfizer"`, `"Regeneron"`). Use `node scripts/check-sec-company-list.mjs <name>` to verify a company is in the list.
- `aliases` – array of strings (can be empty `[]`).

Re-run `npm run edgar-eval` after changes.
