import { describe, it, expect } from "vitest";
import {
  parseRssItems,
  parseFeedDate,
  articleMatchesTarget,
} from "../lib/scan/sources/fiercepharma-agent";
import type { ScanTarget } from "../lib/scan/types";

const tid = (s: string) => s as unknown as ScanTarget["_id"];

describe("parseRssItems", () => {
  it("strips <a> wrappers and extracts fields", () => {
    const xml = `<rss><channel><item>
      <title><a href="/x">Real Title Here</a></title>
      <link>https://www.fiercepharma.com/pharma/real-title</link>
      <description>A lede paragraph.</description>
      <pubDate>Jun 29, 2026 11:09am</pubDate>
      <guid isPermaLink="true">abc-123</guid>
    </item></channel></rss>`;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Real Title Here");
    expect(items[0].link).toBe("https://www.fiercepharma.com/pharma/real-title");
    expect(items[0].description).toBe("A lede paragraph.");
    expect(items[0].pubDate).toBe("Jun 29, 2026 11:09am");
    expect(items[0].guid).toBe("abc-123");
  });

  it("strips CDATA wrappers without corrupting text", () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[Hello & Goodbye]]></title>
      <link>https://www.fiercepharma.com/x</link>
      <description><![CDATA[A lede]]></description>
      <pubDate>Jun 9, 2026 9:05am</pubDate>
      <guid><![CDATA[guid-1]]></guid>
    </item></channel></rss>`;
    const items = parseRssItems(xml);
    expect(items[0].title).toBe("Hello & Goodbye");
    expect(items[0].description).toBe("A lede");
    expect(items[0].guid).toBe("guid-1");
  });

  it("skips items without a link and returns [] when none", () => {
    expect(parseRssItems("<rss></rss>")).toEqual([]);
    const noLink = `<rss><item><title>No link</title></item></rss>`;
    expect(parseRssItems(noLink)).toEqual([]);
  });
});

describe("parseFeedDate", () => {
  it("parses Drupal-style dates to UTC ISO", () => {
    expect(parseFeedDate("Jun 29, 2026 11:09am")).toBe("2026-06-29T11:09:00.000Z");
    expect(parseFeedDate("Jun 9, 2026 9:05am")).toBe("2026-06-09T09:05:00.000Z");
  });
  it("handles 12am/12pm boundaries", () => {
    expect(parseFeedDate("Jan 1, 2026 12:00am")).toBe("2026-01-01T00:00:00.000Z");
    expect(parseFeedDate("Dec 31, 2025 12:00pm")).toBe("2025-12-31T12:00:00.000Z");
    expect(parseFeedDate("Mar 15, 2026 1:30pm")).toBe("2026-03-15T13:30:00.000Z");
  });
  it("returns undefined for unparseable input", () => {
    expect(parseFeedDate("")).toBeUndefined();
    expect(parseFeedDate("garbage")).toBeUndefined();
  });
});

describe("articleMatchesTarget", () => {
  const base = {
    _id: tid("wt"),
    name: "Wegovy",
    displayName: "Wegovy",
    aliases: [] as string[],
  };
  const item = (title: string, description = "") => ({
    title,
    link: "u",
    description,
    pubDate: "",
    guid: "",
  });

  it("matches on name", () => {
    expect(articleMatchesTarget(item("Novo wins approval for Wegovy"), { ...base })).toBe(true);
  });
  it("matches on alias", () => {
    expect(
      articleMatchesTarget(item("Semaglutide update"), { ...base, aliases: ["semaglutide"] }),
    ).toBe(true);
  });
  it("matches on company", () => {
    expect(
      articleMatchesTarget(item("Novo Nordisk Q1"), { ...base, name: "NPR1", company: "Novo Nordisk" }),
    ).toBe(true);
  });
  it("excludes via excludeQueryTerms", () => {
    expect(
      articleMatchesTarget(item("Wegovy recall"), { ...base, excludeQueryTerms: ["recall"] }),
    ).toBe(false);
  });
  it("ignores terms shorter than 2 chars", () => {
    expect(
      articleMatchesTarget(item("some X text"), {
        ...base,
        name: "X",
        displayName: "X",
        aliases: [],
      }),
    ).toBe(false);
  });
  it("returns false when no term appears", () => {
    expect(articleMatchesTarget(item("Pfizer earnings"), { ...base })).toBe(false);
  });
});
