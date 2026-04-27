"use client";

import { useState } from "react";
import type { DecisionConfidence } from "@/lib/types";

function confidenceLabel(c: DecisionConfidence): string {
  switch (c) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    default:
      return c;
  }
}

/**
 * Decision Digest framing: what changed, materiality, actions, and confidence.
 * Always renders a visible section on the digest page; empty runs show setup guidance.
 */
export function DecisionBriefCard(props: {
  deltaSummary?: string;
  materialitySummary?: string;
  recommendedActionsSummary?: string;
  strategicReadSummary?: string;
  confidence?: DecisionConfidence;
  /** When set and the brief is empty, shows a one-click backfill action (POST /api/digest/backfill-decision). */
  digestRunId?: string;
}) {
  const {
    deltaSummary,
    materialitySummary,
    recommendedActionsSummary,
    strategicReadSummary,
    confidence,
    digestRunId,
  } = props;
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const hasAny =
    (deltaSummary?.trim() ?? "") !== "" ||
    (materialitySummary?.trim() ?? "") !== "" ||
    (recommendedActionsSummary?.trim() ?? "") !== "" ||
    (strategicReadSummary?.trim() ?? "") !== "" ||
    confidence != null;

  return (
    <section
      className="card stack"
      style={{ gap: "0.75rem", borderColor: "var(--border, #e5e7eb)" }}
      aria-label="Decision brief"
    >
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Decision brief</h2>
      {!hasAny ? (
        <div className="stack" style={{ gap: "0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }} className="muted">
            No AI decision framing was stored for this digest. You can generate it from the sources
            already linked to this run (Groq + saved raw items), or change your Decision brief
            preference in <strong>Settings → Digest schedule</strong> for future digest emails.
          </p>
          {digestRunId ? (
            <div className="stack" style={{ gap: "0.5rem" }}>
              <button
                type="button"
                disabled={backfillBusy}
                onClick={async () => {
                  setBackfillMessage(null);
                  setBackfillBusy(true);
                  try {
                    const res = await fetch("/api/digest/backfill-decision", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ digestRunId, limit: 1 }),
                    });
                    const data = (await res.json()) as {
                      ok?: boolean;
                      error?: string;
                      results?: Array<{ ok: boolean; skipped?: string; error?: string }>;
                      summary?: { updated: number; skipped: number; failed: number };
                    };
                    if (!res.ok) {
                      setBackfillMessage(data.error ?? res.statusText ?? `HTTP ${res.status}`);
                      return;
                    }
                    const one = data.results?.[0];
                    if (one?.ok && !one.skipped) {
                      setBackfillMessage("Done — refresh if the brief does not appear in a few seconds.");
                      return;
                    }
                    if (one?.skipped) {
                      setBackfillMessage(`Skipped: ${one.skipped}`);
                      return;
                    }
                    if (one?.error) {
                      setBackfillMessage(`Could not generate: ${one.error}`);
                      return;
                    }
                    setBackfillMessage(data.summary?.failed ? "Something went wrong." : "Done.");
                  } catch (e) {
                    setBackfillMessage(e instanceof Error ? e.message : "Request failed");
                  } finally {
                    setBackfillBusy(false);
                  }
                }}
                style={{
                  alignSelf: "flex-start",
                  padding: "0.45rem 0.9rem",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  background: backfillBusy ? "#f3f4f6" : "transparent",
                  cursor: backfillBusy ? "wait" : "pointer",
                }}
              >
                {backfillBusy ? "Generating…" : "Generate decision brief from sources"}
              </button>
              {backfillMessage ? (
                <p
                  style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}
                  className="muted"
                >
                  {backfillMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {confidence != null && (
            <p style={{ margin: 0, fontSize: "0.85rem" }} className="muted">
              <span
                style={{
                  display: "inline-block",
                  padding: "0.2rem 0.5rem",
                  borderRadius: 6,
                  fontWeight: 600,
                  background:
                    confidence === "high"
                      ? "var(--success-bg, #d1fae5)"
                      : confidence === "medium"
                        ? "var(--surface-muted, #f3f4f6)"
                        : "var(--error-bg, #fee2e2)",
                  color:
                    confidence === "high"
                      ? "var(--success, #059669)"
                      : confidence === "medium"
                        ? "var(--ink, #374151)"
                        : "var(--error, #b91c1c)",
                }}
              >
                {confidenceLabel(confidence)}
              </span>
            </p>
          )}
          {(deltaSummary?.trim() ?? "") !== "" && (
            <div>
              <h3 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>What changed</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>{deltaSummary}</p>
            </div>
          )}
          {(materialitySummary?.trim() ?? "") !== "" && (
            <div>
              <h3 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>Why it matters</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>{materialitySummary}</p>
            </div>
          )}
          {(strategicReadSummary?.trim() ?? "") !== "" && (
            <div>
              <h3 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>Strategic read</h3>
              <p
                style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}
              >
                {strategicReadSummary}
              </p>
            </div>
          )}
          {(recommendedActionsSummary?.trim() ?? "") !== "" && (
            <div>
              <h3 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>Suggested next steps</h3>
              <p
                style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}
              >
                {recommendedActionsSummary}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
