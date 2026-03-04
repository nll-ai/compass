# SEC EDGAR: Eval vs App – Why NPR1 Gets No Filings

## The disconnect

- **Eval** (`eval/edgar/outputs/latest.json`): Uses **company-centric** targets. Every target has `name` = ticker (e.g. `REGN`), `displayName` = `Regeneron`, and **`company` = `Regeneron`**. EDGAR then runs a **company lookup** (SEC company list + submissions API) and gets all Regeneron 10-K/10-Q filings.
- **App** (e.g. watch target “NPR1 (Regeneron NPR1 agonist)”): Typically set as a **drug** (or target) with `name` = `NPR1`, `displayName` = `Regeneron NPR1 agonist`, and **`company` often left empty**. EDGAR behavior:
  1. **Pre-seed full-text**: Search SEC for `"NPR1"`. The SEC full-text index often returns little or no relevant 10-K/10-Q (NPR1 is a gene/symbol; filings may not use it in a way that matches).
  2. **Pre-seed company lookup**: Runs **only when `target.company` is set**. If it’s empty → **no Regeneron company lookup** → no Regeneron 10-K/10-Q from the submissions API.
  3. **Agent**: The LLM is told that “company lookups for targets with a company have already been run,” so it may not call `searchSECByCompany("Regeneron")` when the target shows `company: —`.
  4. **Procedural fallback**: Tokenizes `displayName` (“Regeneron NPR1 agonist” → “regeneron”, “npr1”) and *would* match Regeneron in the company list — but this path runs **only when the agent returns 0 items**. If the agent returns any items (e.g. a few from full-text “NPR1”), we return only those and never run the procedural path.

So: **eval always has `company` set → company lookup runs → Regeneron filings. In the app, `company` is often empty for drugs → no company lookup → no (or wrong) EDGAR results.**

## Fix (in code)

- **Derive company via LLM when `company` is empty**: `lib/scan/sources/edgar-agent.ts` calls `deriveCompanyFromTarget(target, openaiKey)`, which uses an LLM (gpt-4o-mini) with a structured prompt to extract the SEC-filing company name from the target’s name, displayName, type, aliases, and notes. That derived company is then used for the pre-seed company lookup so drug/target watch targets (e.g. “NPR1 (Regeneron NPR1 agonist)”) still get the sponsor’s 10-K/10-Q.

- **How EDGAR uses the Company field**: The agent does **not** look up alternatives online; it uses the SEC company list (`company_tickers.json`) and matches the stored `company` string with:
  - **Full term**: SEC company title or ticker includes/equals the term (e.g. “Regeneron Pharmaceuticals” → title “REGENERON PHARMACEUTICALS, INC.” includes it).
  - **First-word fallback**: If no match, the first word is tried (e.g. “Regeneron”) so variants like “Regeneron Pharmaceuticals” or “Regeneron Pharma” still match. Implemented in `findSECCompanyMatch` + `searchSECByCompanyAPI`.

- **Auto-fill disambiguation**: When the target lookup API (`/api/targets/lookup`) returns a company from the LLM (e.g. “Regeneron Pharmaceuticals”), it now calls `resolveCompanyToSEC(company)` against the SEC company list. If there is a match, the API returns the **SEC-normalized display name** (e.g. “Regeneron”) so the Company field is filled with an SEC-searchable value. New targets added via “Add target” therefore get a Company value that reliably matches SEC EDGAR.
