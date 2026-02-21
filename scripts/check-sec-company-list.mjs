#!/usr/bin/env node
/**
 * One-off diagnostic: verify whether a company (e.g. Genocea / GNCA) is present
 * in the SEC company_tickers.json list. Run: node scripts/check-sec-company-list.mjs
 *
 * Usage: node scripts/check-sec-company-list.mjs [tickerOrName]
 * Example: node scripts/check-sec-company-list.mjs GNCA
 *          node scripts/check-sec-company-list.mjs Genocea
 */

const SEC_USER_AGENT = "Compass competitive intelligence app (contact via GitHub)";
const URL = "https://www.sec.gov/files/company_tickers.json";

const searchTerms = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["GNCA", "Genocea", "1326110", "1457612"];

async function main() {
  const res = await fetch(URL, {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error("Failed to fetch company list:", res.status, res.statusText);
    process.exit(1);
  }
  const data = await res.json();
  const companies = Object.values(data);

  console.log("SEC company_tickers.json: total entries =", companies.length);
  console.log("Search terms:", searchTerms.join(", "));
  console.log("");

  for (const term of searchTerms) {
    const t = term.toLowerCase();
    const byTicker = companies.filter((c) => (c.ticker || "").toLowerCase() === t);
    const byCik = companies.filter(
      (c) => String(c.cik_str) === term || String(c.cik_str).padStart(10, "0") === term.padStart(10, "0")
    );
    const byTitle = companies.filter(
      (c) => (c.title || "").toLowerCase().includes(t)
    );

    const found = new Map();
    for (const c of [...byTicker, ...byCik, ...byTitle]) found.set(c.cik_str, c);
    const matches = [...found.values()];

    if (matches.length === 0) {
      console.log(`  "${term}": NOT FOUND`);
    } else {
      console.log(`  "${term}": ${matches.length} match(es)`);
      for (const c of matches) {
        console.log(`    CIK ${String(c.cik_str).padStart(10, "0")} | ${c.ticker} | ${c.title}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
