import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const lookupSchema = z.object({
  name: z.string().describe("Primary search term (e.g. REGN5381, B7-H3)"),
  displayName: z.string().describe("Human-readable label, e.g. 'REGN5381 (Regeneron NPR1 agonist)'"),
  aliases: z.array(z.string()).describe("Alternative names and search terms to monitor"),
  type: z.enum(["drug", "target", "company"]).describe("drug = therapeutic asset, target = biological target, company = company"),
  therapeuticArea: z.enum(["cardiovascular", "oncology", "other"]),
  indication: z.string().nullable().optional().describe("Disease or condition, e.g. HFpEF, SCLC"),
  company: z.string().nullable().optional().describe("Sponsor or developer company name"),
});

async function searchExa(query: string): Promise<{ title: string; text?: string; url: string }[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) return [];

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      query: `${query} biopharma drug development clinical trial`,
      numResults: 12,
      type: "auto",
      contents: { text: { maxCharacters: 1500 } },
    }),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ title?: string; text?: string; url?: string }> };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    text: r.text ?? "",
    url: r.url ?? "",
  }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const searchResults = await searchExa(query);
    const context = searchResults.length > 0
      ? searchResults.map((r, i) => `[${i + 1}] ${r.title}\n${r.text || ""}\n${r.url}`).join("\n\n")
      : "No web results returned. Infer from the user query only.";

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: lookupSchema,
      system: `You are a competitive intelligence analyst for biopharma. Given a user query describing something to track (a drug, target, company, or program), and optional web search results, extract structured fields for a watch target.

Rules:
- name: canonical identifier to search for (e.g. REGN5381, B7-H3, NPR1). Prefer program/asset code or gene/target symbol.
- displayName: one clear line for UI, e.g. "REGN5381 (Regeneron NPR1 agonist)" or "B7-H3 (CD276)".
- aliases: list of alternative names, codes, and terms that should be searched in feeds (other trial IDs, molecule names, competitor names for the same target).
- type: "drug" for a therapeutic asset/program, "target" for a biological target/pathway, "company" for a company.
- therapeuticArea: cardiovascular, oncology, or other.
- indication: specific disease/indication if known (e.g. HFpEF, heart failure, SCLC). Omit or null if unknown.
- company: developer/sponsor company if known. Omit or null if unknown (e.g. for a biological target with many developers).

Base your answer on the web search results when available. If results are missing or ambiguous, infer from the user query and use sensible defaults. Prefer concrete values over "unknown"; use "other" for therapeutic area only when truly unclear.`,
      prompt: `User wants to track: "${query}"

Web search results:
${context}

Extract the watch target fields.`,
    });

    const normalized = {
      ...object,
      indication: object.indication ?? undefined,
      company: object.company ?? undefined,
    };
    return NextResponse.json(normalized);
  } catch (e) {
    console.error("Target lookup error:", e);
    const isSchemaError =
      e instanceof Error &&
      ("No object generated" in e || e.message?.includes("schema") || e.message?.includes("validation"));
    const friendlyMessage = isSchemaError
      ? "We couldn't automatically fill the details for that. Try rephrasing your search, or add the target manually and fill in the fields below."
      : "Lookup failed. Check your connection and try again.";
    return NextResponse.json({ error: friendlyMessage }, { status: 500 });
  }
}
