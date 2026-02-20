import type { ScanTarget, SourceResult } from "../types";

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

export async function runEdgar(targets: ScanTarget[]): Promise<SourceResult> {
  const items: SourceResult["items"] = [];
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return { items: [], error: `SEC company list: ${res.status}` };
    const data = (await res.json()) as Record<string, CompanyTickerEntry>;
    const companies = Object.values(data);

    const seenAccessions = new Set<string>();
    const formsWeWant = ["10-K", "10-Q"];

    for (const target of targets) {
      const searchTerms = [target.name, target.displayName, ...target.aliases].map((s) =>
        s.trim().toLowerCase()
      ).filter(Boolean);
      const matches = companies.filter((c) => {
        const title = (c.title ?? "").toLowerCase();
        const ticker = (c.ticker ?? "").toLowerCase();
        return searchTerms.some((t) => title.includes(t) || ticker === t || title === t);
      });

      for (const company of matches.slice(0, 5)) {
        const cik = company.cik_str;
        const cikPadded = padCik(cik);
        const subRes = await fetch(
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

        for (let i = 0; i < Math.min(forms.length, 20); i++) {
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
    return { items };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
