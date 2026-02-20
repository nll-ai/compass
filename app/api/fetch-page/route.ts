import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;
const FORMATTED_MAX_CHARS = 80_000;

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    let p = u.pathname.replace(/\/$/, "") || "/";
    return `${u.origin}${p}`.toLowerCase();
  } catch {
    return url;
  }
}

function isUrlAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return false;
    if (host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Crude HTML-to-text: strip script/style, replace block tags with newlines, then strip remaining tags. */
function htmlToText(html: string): string {
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "");
  const blockTags = /<(?:div|p|br|h[1-6]|li|tr|article|section|header|footer|main)[^>]*>/gi;
  s = s.replace(blockTags, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[#\w]+;/g, " ");
  return s
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim()
    .slice(0, 100_000);
}

/** If URL is a PubMed article page, fetch article text via the API (avoids JS-rendered page). */
async function fetchPubMedArticle(url: string): Promise<string | null> {
  const m = url.match(/^https?:\/\/(?:www\.)?pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?/i);
  if (!m) return null;
  const pmid = m[1];
  const apiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    const blocks = text.split(/\n\nPMID: (\d+) \[Indexed for MEDLINE\]/);
    for (let i = 1; i < blocks.length; i += 2) {
      const block = blocks[i - 1]?.trim() ?? "";
      if (block) return block.slice(0, 100_000);
    }
    return text.trim().slice(0, 100_000) || null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/** Use OpenAI to turn raw scraped/API text into clean, readable content. */
async function formatWithOpenAI(rawText: string, openaiKey: string | undefined): Promise<string> {
  if (!openaiKey || rawText.length < 50) return rawText.slice(0, FORMATTED_MAX_CHARS);
  const truncated = rawText.slice(0, 50_000);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a formatter. Given raw scraped or API text from a web page (e.g. article, abstract, press release), produce a single clean, readable plain-text version. Preserve all substantive content: title, headings, paragraphs, lists, key facts. Remove navigation, ads, cookie notices, and boilerplate. Use clear line breaks. Output only the formatted text, no commentary.",
        },
        { role: "user", content: truncated },
      ],
      max_tokens: 16_384,
    }),
  });
  if (!res.ok) return rawText.slice(0, FORMATTED_MAX_CHARS);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = data.choices?.[0]?.message?.content?.trim();
  return (out ?? rawText).slice(0, FORMATTED_MAX_CHARS);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url || !isUrlAllowed(url)) {
      return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 400 });
    }

    const normalizedUrl = normalizeUrl(url);
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    const secret = process.env.SCAN_SECRET;
    const openaiKey = process.env.OPENAI_API_KEY;

    // Return cached formatted content if present
    if (convexUrl) {
      const client = new ConvexHttpClient(convexUrl);
      const cached = await client.query(api.pageContentCache.getByUrl, { url: normalizedUrl });
      if (cached?.formattedContent) {
        return NextResponse.json({ content: cached.formattedContent });
      }
    }

    let rawContent: string | null = null;

    // PubMed renders content with JS; use their API instead of scraping HTML
    const pubmedContent = await fetchPubMedArticle(url);
    if (pubmedContent) {
      rawContent = pubmedContent;
    }

    if (!rawContent) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Compass/1.0 (competitive intelligence; +https://github.com/compintel/compass)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { error: `Fetch failed: ${res.status} ${res.statusText}` },
          { status: 502 }
        );
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return NextResponse.json(
          { error: "URL did not return HTML or plain text" },
          { status: 400 }
        );
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: `Page too large (max ${MAX_BODY_BYTES / 1e6}MB)` },
          { status: 413 }
        );
      }

      const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      rawContent = htmlToText(html);
    }

    if (!rawContent) {
      return NextResponse.json({ error: "No text content extracted" }, { status: 422 });
    }

    const formattedContent = await formatWithOpenAI(rawContent, openaiKey);

    if (convexUrl && secret) {
      const client = new ConvexHttpClient(convexUrl);
      await client.mutation(api.pageContentCache.setCached, {
        secret,
        url: normalizedUrl,
        formattedContent,
      });
    }

    return NextResponse.json({ content: formattedContent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort")) {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
