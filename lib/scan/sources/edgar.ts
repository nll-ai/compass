import type { ScanTarget, SourceResult, ScanOptions } from "../types";
import type { SourceAgentContext } from "../agent-context";
import { fetchWithRetry } from "../fetchWithRetry";
import { runEdgarAgent } from "./edgar-agent";

const SEC_USER_AGENT_DEFAULT = "Compass competitive intelligence app (contact via GitHub)";
function getSECUserAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT?.trim() || SEC_USER_AGENT_DEFAULT;
}

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

const STOPWORDS = new Set(["inc", "corp", "ltd", "co", "llc", "plc", "lp", "na", "sa", "ag", "nv", "the", "and", "or"]);

/** Extract significant words for SEC company matching (e.g. "Genocea Biosciences, Inc." or "GEN-003 (Genocea Biosciences HSV-2 vaccine)" → ["genocea", "biosciences", "gen-003", "hsv-2", "vaccine"]). */
function tokenizeForMatching(text: string): string[] {
  if (!text?.trim()) return [];
  return text
    .trim()
    .split(/[\s,(.)/&]+/)
    .map((s) => s.replace(/\./g, "").trim().toLowerCase())
    .filter((s) => s.length >= 2 && !STOPWORDS.has(s));
}

/** Tokens from company field only (legacy helper). */
function companyNameTokens(company: string): string[] {
  return tokenizeForMatching(company);
}

/**
 * Procedural SEC company-list path: match targets to companies by name tokens,
 * fetch recent 10-K/10-Q from submissions API. Used only as fallback when the agent returns no items.
 */
async function runEdgarProcedural(
  context: SourceAgentContext,
  options: ScanOptions | undefined
): Promise<SourceResult["items"]> {
  const { targets } = context;
  const items: SourceResult["items"] = [];
  const seenAccessions = new Set<string>();
  const companiesLimit = getCompaniesLimit(options);
  const filingsLimit = getFilingsLimit(options);

  const res = await fetchWithRetry("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": getSECUserAgent(), Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Record<string, CompanyTickerEntry>;
  const companies = Object.values(data);
  const formsWeWant = ["10-K", "10-Q"];

  for (const target of targets) {
    const companyTerms = target.company
      ? [target.company.trim().toLowerCase(), ...companyNameTokens(target.company)]
      : [];
    const nameTokens = [
      ...tokenizeForMatching(target.name),
      ...tokenizeForMatching(target.displayName),
      ...(target.aliases ?? []).flatMap((a) => tokenizeForMatching(a)),
    ];
    const learned = (target.learnedQueryTerms ?? []).slice(0, 3).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const searchTerms = [...new Set([...companyTerms, ...nameTokens, ...learned])];
    const matches = companies.filter((c) => {
      const title = (c.title ?? "").toLowerCase();
      const ticker = (c.ticker ?? "").toLowerCase();
      return searchTerms.some((t) => title.includes(t) || ticker === t || title === t);
    });

    for (const company of matches.slice(0, companiesLimit)) {
      const cik = company.cik_str;
      const cikPadded = padCik(cik);
        const subRes = await fetchWithRetry(
          `https://data.sec.gov/submissions/CIK${cikPadded}.json`,
          { headers: { "User-Agent": getSECUserAgent(), Accept: "application/json" } }
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
  return items;
}

export async function runEdgar(context: SourceAgentContext): Promise<SourceResult> {
  const { targets, env, scanOptions: options } = context;

  try {
    // Agent in charge: run agentic search first (LLM + tools: full-text, company lookup).
    const agentResult =
      targets.length > 0 && env.OPENAI_API_KEY
        ? await runEdgarAgent(context, {
            maxSteps: 5,
            fullTextCount: options?.mode === "comprehensive" ? 20 : 12,
          })
        : { items: [] };

    if (agentResult.items.length > 0) {
      return agentResult;
    }
    if (agentResult.error) {
      return { items: [], error: agentResult.error };
    }

    // Fallback: when agent returns nothing (and no error), use procedural company-list path.
    const proceduralItems = await runEdgarProcedural(context, options);
    return { items: proceduralItems };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
