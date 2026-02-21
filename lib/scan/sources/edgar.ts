import type { ScanTarget, SourceResult, ScanOptions } from "../types";
import { fetchWithRetry } from "../fetchWithRetry";
import { runSECSearchAgent } from "./edgar-agent";

const SEC_USER_AGENT = "Compass competitive intelligence app (contact via GitHub)";

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SubmissionsRecent {
  form?: string[];
  accessionNumber?: string[];
  filingDate?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}

function padCik(cik: number): string {
  return cik.toString().padStart(10, "0");
}

function accessionToPath(acc: string): string {
  return acc.replace(/-/g, "");
}

function getCompaniesLimit(options?: ScanOptions): number {
  return options?.mode === "comprehensive" ? 10 : 5;
}

function getFilingsLimit(options?: ScanOptions): number {
  return options?.mode === "comprehensive" ? 50 : 20;
}

/** Extract significant words from company name for matching (e.g. "Genocea Biosciences, Inc." → ["Genocea", "Biosciences"]). */
function companyNameTokens(company: string): string[] {
  const skip = new Set(["inc", "corp", "ltd", "co", "llc", "plc", "lp", "na", "sa", "ag", "nv", "the"]);
  return company
    .trim()
    .split(/[\s,/&]+/)
    .map((s) => s.replace(/\./g, "").trim().toLowerCase())
    .filter((s) => s.length >= 2 && !skip.has(s));
}

export async function runEdgar(
  targets: ScanTarget[],
  env: Record<string, string | undefined>,
  options?: ScanOptions
): Promise<SourceResult> {
  const items: SourceResult["items"] = [];
  const seenAccessions = new Set<string>();
  const companiesLimit = getCompaniesLimit(options);
  const filingsLimit = getFilingsLimit(options);

  try {
    // Run SEC search subagent (full-text + company lookup with query expansion) in parallel with company-list fetch
    const agentPromise =
      targets.length > 0 && env.OPENAI_API_KEY
        ? runSECSearchAgent(targets, env.OPENAI_API_KEY, {
            maxSteps: 5,
            fullTextCount: options?.mode === "comprehensive" ? 20 : 12,
          })
        : Promise.resolve([]);

    const res = await fetchWithRetry("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return { items: [], error: `SEC company list: ${res.status}` };
    const data = (await res.json()) as Record<string, CompanyTickerEntry>;
    const companies = Object.values(data);

    const formsWeWant = ["10-K", "10-Q"];

    for (const target of targets) {
      const companyTerms = target.company
        ? [target.company, ...companyNameTokens(target.company)]
        : [];
      const baseTerms = [
        target.name,
        target.displayName,
        ...target.aliases,
        ...companyTerms,
      ];
      const learned = (target.learnedQueryTerms ?? []).slice(0, 3);
      const searchTerms = [...new Set([...baseTerms, ...learned].map((s) =>
        s.trim().toLowerCase()
      ).filter(Boolean))];
      const matches = companies.filter((c) => {
        const title = (c.title ?? "").toLowerCase();
        const ticker = (c.ticker ?? "").toLowerCase();
        return searchTerms.some((t) => title.includes(t) || ticker === t || title === t);
      });

      if (process.env.DEBUG_EDGAR === "1") {
        console.debug("[Edgar]", target.displayName, { searchTerms: searchTerms.slice(0, 15), matchesCount: matches.length, firstMatch: matches[0]?.title });
      }

      for (const company of matches.slice(0, companiesLimit)) {
        const cik = company.cik_str;
        const cikPadded = padCik(cik);
        const subRes = await fetchWithRetry(
          `https://data.sec.gov/submissions/CIK${cikPadded}.json`,
          { headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" } }
        );
        if (!subRes.ok) continue;
        const sub = (await subRes.json()) as {
          filings?: { recent?: SubmissionsRecent };
          recent?: SubmissionsRecent;
        };
        const recent = sub.filings?.recent ?? sub.recent;
        if (!recent?.form || !recent.accessionNumber) continue;

        const forms = recent.form as string[];
        const accessions = recent.accessionNumber as string[];
        const dates = (recent.filingDate as string[]) ?? [];
        const primaries = (recent.primaryDocument as string[]) ?? [];

        for (let i = 0; i < Math.min(forms.length, filingsLimit); i++) {
          if (!formsWeWant.includes(forms[i])) continue;
          const acc = accessions[i];
          if (!acc || seenAccessions.has(acc)) continue;
          seenAccessions.add(acc);
          const pathPart = accessionToPath(acc);
          const primary = primaries[i] ?? `${acc.replace(/-/g, "")}.htm`;
          const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${pathPart}/${primary}`;
          const filingLabel = forms[i];
          const dateStr = dates[i] ?? "";
          items.push({
            watchTargetId: target._id,
            externalId: acc,
            title: `${filingLabel} - ${company.title}${dateStr ? ` (${dateStr})` : ""}`,
            url,
            abstract: undefined,
            publishedAt: dateStr ? new Date(dateStr).getTime() : undefined,
            metadata: { cik, form: forms[i], company: company.title },
          });
        }
      }
    }

    // Merge subagent results (dedupe by externalId)
    const agentItems = await agentPromise;
    for (const agentItem of agentItems) {
      if (agentItem.externalId && !seenAccessions.has(agentItem.externalId)) {
        seenAccessions.add(agentItem.externalId);
        items.push(agentItem);
      }
    }

    return { items };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
