/**
 * Seeds eval/diff/cases with 20 synthetic + simulated PubMed-window cases (plan Step 9: 15–25 cases).
 * Idempotent: skips existing folders unless --force.
 *
 *   npx tsx scripts/seed-diff-eval-corpus.ts
 *   npx tsx scripts/seed-diff-eval-corpus.ts --force
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { stringify as stringifyYaml } from "yaml";

const ROOT = process.cwd();
const CASES = join(ROOT, "eval", "diff", "cases");

type CaseSeed = {
  id: string;
  before: string;
  after: string;
  metadata: {
    source: string;
    difficulty: string;
    change_types: string[];
    date_window?: {
      before_start?: string;
      before_end?: string;
      after_start?: string;
      after_end?: string;
    };
    ground_truth_notes: string;
  };
  expected: {
    must_mention?: string[];
    must_not_mention?: string[];
    expected_facts?: string[];
  };
  summaryMd: string;
};

function trialSnippet(opts: {
  id: string;
  phase: string;
  endpoint: string;
  n: string;
  extra?: string;
}): string {
  return `Study ${opts.id} (${opts.phase}). Primary endpoint: ${opts.endpoint}. Target enrollment: ${opts.n} participants. ${opts.extra ?? ""}Last updated on registry.`;
}

const SEEDS: CaseSeed[] = [
  {
    id: "synthetic-nochange-01",
    before: trialSnippet({ id: "NCT10000001", phase: "Phase 2", endpoint: "PFS", n: "150", extra: "Single-arm design. " }),
    after: trialSnippet({ id: "NCT10000001", phase: "Phase 2", endpoint: "PFS", n: "150", extra: "Single-arm design. " }),
    metadata: {
      source: "clinicaltrials",
      difficulty: "easy",
      change_types: ["no_material_change"],
      ground_truth_notes: "Identical text; summary should not invent material deltas.",
    },
    expected: { must_not_mention: ["phase 3 failure", "trial terminated"] },
    summaryMd: "# Rubric\n\nNo material change. Low confidence or explicit 'no substantive change' is acceptable.\n",
  },
  {
    id: "synthetic-nochange-02",
    before: "Sponsor: Acme Bio. Indication: NSCLC. Status: Recruiting.\n",
    after: "Sponsor: Acme Bio. Indication: NSCLC. Status: Recruiting.\n\n",
    metadata: {
      source: "clinicaltrials",
      difficulty: "easy",
      change_types: ["no_material_change"],
      ground_truth_notes: "Whitespace-only delta.",
    },
    expected: {},
    summaryMd: "# Rubric\n\nTreat as no material registry change.\n",
  },
  {
    id: "synthetic-nochange-03",
    before: "Arm A receives drug X. Arm B receives placebo. Primary outcome: OS at 24 months.",
    after: "Arm B receives placebo. Arm A receives drug X. Primary outcome: OS at 24 months.",
    metadata: {
      source: "clinicaltrials",
      difficulty: "medium",
      change_types: ["no_material_change"],
      ground_truth_notes: "Same facts, sentence reorder.",
    },
    expected: { expected_facts: ["overall survival", "24 months"] },
    summaryMd: "# Rubric\n\nEndpoints and arms unchanged in substance.\n",
  },
  {
    id: "synthetic-nochange-04",
    before: "Estimated primary completion: Q4 2026.",
    after: "Estimated primary completion: Q4 2026 (unchanged).",
    metadata: {
      source: "clinicaltrials",
      difficulty: "easy",
      change_types: ["no_material_change"],
      ground_truth_notes: "Clarification only.",
    },
    expected: { must_mention: ["2026"] },
    summaryMd: "# Rubric\n\nTimeline fact preserved.\n",
  },
  {
    id: "synthetic-nochange-05",
    before: "Abstract: Phase 1/2 study of molecule M in solid tumors. MTD not reached.",
    after: "Abstract: Phase 1/2 study of molecule M in solid tumors. MTD not reached at latest data cut.",
    metadata: {
      source: "pubmed",
      difficulty: "medium",
      change_types: ["no_material_change"],
      ground_truth_notes: "Minor wording; same scientific claim.",
    },
    expected: { expected_facts: ["phase 1/2", "MTD"] },
    summaryMd: "# Rubric\n\nNo new efficacy endpoint or population change.\n",
  },
  {
    id: "synthetic-endpoint-01",
    before: trialSnippet({ id: "NCT20000001", phase: "Phase 3", endpoint: "overall survival", n: "400" }),
    after: trialSnippet({ id: "NCT20000001", phase: "Phase 3", endpoint: "progression-free survival", n: "400" }),
    metadata: {
      source: "clinicaltrials",
      difficulty: "easy",
      change_types: ["endpoint_change"],
      ground_truth_notes: "Primary endpoint OS → PFS.",
    },
    expected: {
      must_mention: ["PFS", "progression-free"],
      must_not_mention: ["breast cancer-only indication"],
      expected_facts: ["progression-free survival", "400"],
    },
    summaryMd: "# Rubric\n\nMust reflect primary endpoint switch to PFS.\n",
  },
  {
    id: "synthetic-endpoint-02",
    before: "Secondary endpoints: ORR only.",
    after: "Secondary endpoints: ORR, duration of response, and patient-reported outcomes.",
    metadata: {
      source: "clinicaltrials",
      difficulty: "medium",
      change_types: ["endpoint_change"],
      ground_truth_notes: "Added secondary endpoints.",
    },
    expected: { expected_facts: ["patient-reported", "duration of response"] },
    summaryMd: "# Rubric\n\nNew secondary endpoints listed.\n",
  },
  {
    id: "synthetic-endpoint-03",
    before: "Hazard ratio for OS (vs control) pre-specified as primary analysis.",
    after: "Hazard ratio for PFS (vs control) pre-specified as primary analysis; OS key secondary.",
    metadata: {
      source: "pubmed",
      difficulty: "hard",
      change_types: ["endpoint_change"],
      ground_truth_notes: "Hierarchy shift OS→PFS with OS secondary.",
    },
    expected: { must_mention: ["PFS"], expected_facts: ["hazard ratio", "secondary"] },
    summaryMd: "# Rubric\n\nCapture primary/secondary hierarchy change.\n",
  },
  {
    id: "synthetic-enrollment-01",
    before: trialSnippet({ id: "NCT30000001", phase: "Phase 2", endpoint: "ORR", n: "120" }),
    after: trialSnippet({ id: "NCT30000001", phase: "Phase 2", endpoint: "ORR", n: "180" }),
    metadata: {
      source: "clinicaltrials",
      difficulty: "easy",
      change_types: ["enrollment_change"],
      ground_truth_notes: "Enrollment target 120→180.",
    },
    expected: { must_mention: ["180"], expected_facts: ["180", "ORR"] },
    summaryMd: "# Rubric\n\nEnrollment increase must appear.\n",
  },
  {
    id: "synthetic-enrollment-02",
    before: "Recruitment status: Not yet recruiting.",
    after: "Recruitment status: Recruiting; 45 sites activated.",
    metadata: {
      source: "clinicaltrials",
      difficulty: "medium",
      change_types: ["enrollment_change"],
      ground_truth_notes: "Activation and site count.",
    },
    expected: { expected_facts: ["recruiting", "45"] },
    summaryMd: "# Rubric\n\nStatus and site count change.\n",
  },
  {
    id: "synthetic-safety-01",
    before: "Safety: standard AE monitoring per protocol.",
    after: "Safety: AESI monitoring added for hepatic events; enhanced LFT schedule.",
    metadata: {
      source: "clinicaltrials",
      difficulty: "medium",
      change_types: ["safety_signal"],
      ground_truth_notes: "AESI / hepatic monitoring.",
    },
    expected: { must_mention: ["hepatic", "AESI"], expected_facts: ["LFT"] },
    summaryMd: "# Rubric\n\nSafety monitoring intensification.\n",
  },
  {
    id: "synthetic-safety-02",
    before: "No dose-limiting toxicities in cohort 1.",
    after: "One DLT (Grade 3) observed in cohort 2; cohort expansion paused pending review.",
    metadata: {
      source: "pubmed",
      difficulty: "hard",
      change_types: ["safety_signal"],
      ground_truth_notes: "DLT and pause.",
    },
    expected: { expected_facts: ["DLT", "cohort"], must_not_mention: ["trial permanently closed"] },
    summaryMd: "# Rubric\n\nDLT and pause; do not overstate termination.\n",
  },
  {
    id: "synthetic-guidance-01",
    before: "Regulatory: standard IND pathway.",
    after: "Regulatory: Type B meeting completed; alignment on Phase 3 design elements.",
    metadata: {
      source: "edgar",
      difficulty: "medium",
      change_types: ["guidance_update"],
      ground_truth_notes: "FDA meeting milestone.",
    },
    expected: { must_mention: ["Type B", "Phase 3"], expected_facts: ["meeting"] },
    summaryMd: "# Rubric\n\nRegulatory interaction captured.\n",
  },
  {
    id: "synthetic-guidance-02",
    before: "No SPA referenced.",
    after: "Special Protocol Assessment (SPA) agreement received for pivotal protocol v3.",
    metadata: {
      source: "edgar",
      difficulty: "medium",
      change_types: ["guidance_update"],
      ground_truth_notes: "SPA received.",
    },
    expected: { must_mention: ["SPA"], expected_facts: ["protocol"] },
    summaryMd: "# Rubric\n\nSPA must be mentioned.\n",
  },
  {
    id: "synthetic-regulatory-01",
    before: "Label: approved for second-line metastatic indication only.",
    after: "Label: expanded to include first-line combination in same tumor type per sNDA approval.",
    metadata: {
      source: "openfda",
      difficulty: "hard",
      change_types: ["label_change"],
      ground_truth_notes: "Indication expansion.",
    },
    expected: { must_mention: ["first-line", "combination"], expected_facts: ["sNDA"] },
    summaryMd: "# Rubric\n\nLine-of-therapy expansion.\n",
  },
  {
    id: "synthetic-company-01",
    before: "Sponsor responsible party: OldPharma Inc.",
    after: "Sponsor responsible party: NewCo Therapeutics (acquisition completed).",
    metadata: {
      source: "clinicaltrials",
      difficulty: "medium",
      change_types: ["sponsor_change"],
      ground_truth_notes: "Sponsor transfer.",
    },
    expected: { must_mention: ["NewCo"], expected_facts: ["acquisition"] },
    summaryMd: "# Rubric\n\nSponsor change / acquisition.\n",
  },
  {
    id: "pubmed-sim-window-01",
    before:
      "PubMed snapshot A: Title: Phase 2 trial of drug D in melanoma. Abstract: ORR 22% in refractory patients. PMID:9000001.",
    after:
      "PubMed snapshot B: Title: Phase 2 trial of drug D in melanoma — updated efficacy. Abstract: ORR 28% with longer follow-up. PMID:9000001.",
    metadata: {
      source: "pubmed",
      difficulty: "easy",
      change_types: ["efficacy_update"],
      date_window: {
        before_start: "2024-01-01",
        before_end: "2024-06-30",
        after_start: "2024-07-01",
        after_end: "2024-12-31",
      },
      ground_truth_notes: "Simulated adjacent-window replay (ORR change).",
    },
    expected: { must_mention: ["28%"], expected_facts: ["ORR"] },
    summaryMd: "# Rubric\n\nEfficacy percentage update.\n",
  },
  {
    id: "pubmed-sim-window-02",
    before: "Results posted: median PFS 4.1 months (prior cut).",
    after: "Results posted: median PFS 5.3 months (matured analysis).",
    metadata: {
      source: "pubmed",
      difficulty: "medium",
      change_types: ["efficacy_update"],
      date_window: {
        before_start: "2023-01-01",
        before_end: "2023-06-30",
        after_start: "2023-07-01",
        after_end: "2023-12-31",
      },
      ground_truth_notes: "PFS maturity.",
    },
    expected: { must_mention: ["5.3"], expected_facts: ["PFS"] },
    summaryMd: "# Rubric\n\nPFS numeric update.\n",
  },
  {
    id: "pubmed-sim-window-03",
    before: "Abstract mentions exploratory biomarker subset only.",
    after: "Abstract adds pre-specified biomarker-positive cohort with hazard ratio reported.",
    metadata: {
      source: "pubmed",
      difficulty: "hard",
      change_types: ["endpoint_change", "publication"],
      date_window: {
        before_start: "2022-01-01",
        before_end: "2022-12-31",
        after_start: "2023-01-01",
        after_end: "2023-12-31",
      },
      ground_truth_notes: "Biomarker cohort upgrade.",
    },
    expected: { expected_facts: ["biomarker", "hazard ratio"] },
    summaryMd: "# Rubric\n\nBiomarker cohort analysis added.\n",
  },
  {
    id: "pubmed-sim-window-04",
    before: "Trial listed as Phase 1b.",
    after: "Trial amended to Phase 2 expansion at RP2D.",
    metadata: {
      source: "pubmed",
      difficulty: "medium",
      change_types: ["trial_phase"],
      date_window: {
        before_start: "2021-06-01",
        before_end: "2021-12-31",
        after_start: "2022-01-01",
        after_end: "2022-06-30",
      },
      ground_truth_notes: "Phase escalation.",
    },
    expected: { must_mention: ["Phase 2"], expected_facts: ["RP2D"] },
    summaryMd: "# Rubric\n\nPhase transition.\n",
  },
  {
    id: "pubmed-sim-window-05",
    before: "No interim analysis planned per protocol v1.",
    after: "Protocol v2: interim analysis at 50% events for futility/efficacy.",
    metadata: {
      source: "clinicaltrials",
      difficulty: "hard",
      change_types: ["protocol_amendment"],
      date_window: {
        before_start: "2020-01-01",
        before_end: "2020-12-31",
        after_start: "2021-01-01",
        after_end: "2021-12-31",
      },
      ground_truth_notes: "Interim analysis added.",
    },
    expected: { must_mention: ["interim"], expected_facts: ["50%"] },
    summaryMd: "# Rubric\n\nInterim analysis introduction.\n",
  },
  {
    id: "pubmed-sim-window-06",
    before: "Companion diagnostic not required per initial publication.",
    after: "Updated manuscript: PD-L1 IHC 22C3 companion diagnostic linked to enrollment strata.",
    metadata: {
      source: "pubmed",
      difficulty: "medium",
      change_types: ["companion_diagnostic"],
      date_window: {
        before_start: "2019-01-01",
        before_end: "2019-12-31",
        after_start: "2020-01-01",
        after_end: "2020-12-31",
      },
      ground_truth_notes: "CDx linkage appears in later window.",
    },
    expected: { expected_facts: ["companion diagnostic", "PD-L1"] },
    summaryMd: "# Rubric\n\nCDx / biomarker testing requirement.\n",
  },
  {
    id: "pubmed-sim-window-07",
    before: "Abstract lists single-country sites.",
    after: "Abstract updated: multinational expansion with EU and Japan sites opened.",
    metadata: {
      source: "pubmed",
      difficulty: "easy",
      change_types: ["geographic_expansion"],
      date_window: {
        before_start: "2018-06-01",
        before_end: "2018-12-31",
        after_start: "2019-01-01",
        after_end: "2019-06-30",
      },
      ground_truth_notes: "Geography expansion.",
    },
    expected: { must_mention: ["Japan"], expected_facts: ["multinational"] },
    summaryMd: "# Rubric\n\nGeographic footprint change.\n",
  },
  {
    id: "pubmed-sim-window-08",
    before: "Funding: investigator-initiated grant only.",
    after: "Funding: industry co-sponsorship disclosed; conflict of interest section expanded.",
    metadata: {
      source: "pubmed",
      difficulty: "medium",
      change_types: ["disclosure_update"],
      date_window: {
        before_start: "2017-01-01",
        before_end: "2017-12-31",
        after_start: "2018-01-01",
        after_end: "2018-12-31",
      },
      ground_truth_notes: "Sponsorship / COI update.",
    },
    expected: { expected_facts: ["co-sponsorship", "conflict"] },
    summaryMd: "# Rubric\n\nFunding or COI transparency change.\n",
  },
];

function writeCase(c: CaseSeed, force: boolean): void {
  const dir = join(CASES, c.id);
  if (existsSync(dir) && !force) {
    console.log("skip (exists):", c.id);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "before.txt"), c.before, "utf8");
  writeFileSync(join(dir, "after.txt"), c.after, "utf8");
  writeFileSync(join(dir, "metadata.yaml"), stringifyYaml(c.metadata, { lineWidth: 0 }), "utf8");
  writeFileSync(join(dir, "expected_changes.yaml"), stringifyYaml(c.expected, { lineWidth: 0 }), "utf8");
  writeFileSync(join(dir, "expected_summary.md"), c.summaryMd, "utf8");
  console.log("wrote:", c.id);
}

function main(): void {
  const force = process.argv.includes("--force");
  mkdirSync(CASES, { recursive: true });
  for (const c of SEEDS) {
    writeCase(c, force);
  }
  console.log("Done. Case count (approx):", SEEDS.length, "+ synthetic-smoke if present.");
}

main();
