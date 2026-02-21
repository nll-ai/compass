"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Doc } from "@/convex/_generated/dataModel";
import { SourceBadge } from "@/components/compass/SourceBadge";
import { SourceLinkOverlay } from "@/components/compass/SourceLinkOverlay";
import type { SourceType } from "@/lib/types";
import { useState } from "react";

const FOCUS_OPTIONS = [
  { value: "clinical_trials", label: "Clinical trials", sources: ["clinicaltrials"] as const },
  { value: "sec_filings", label: "SEC filings", sources: ["edgar"] as const },
  { value: "publications", label: "Publications", sources: ["pubmed", "patents"] as const },
  { value: "news", label: "News", sources: ["exa", "rss"] as const },
  { value: "all", label: "All sources", sources: undefined },
] as const;

type FocusValue = (typeof FOCUS_OPTIONS)[number]["value"];

function getSourcesForFocus(focus: FocusValue): string[] | undefined {
  const option = FOCUS_OPTIONS.find((o) => o.value === focus);
  return option?.sources ? [...option.sources] : undefined;
}

function formatTimelineDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function cleanSummary(raw: string): string {
  let text = raw.trim();

  // HTML entities
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');

  // Common web-scrape noise
  text = text.replace(/\[skip to [\w\s]+\]/gi, "");
  text = text.replace(/advertisement\s*\*/gi, "");
  text = text.replace(/loading metrics/gi, "");
  text = text.replace(/\|\s*PLOS\s/gi, "");
  text = text.replace(/Get more clinical research insight with our FREE newsletter/gi, "");
  text = text.replace(/Hide glossary#+\s*Glossary[^.]*\./gi, "");
  text = text.replace(/Study record managers:[^.]*\./gi, "");
  text = text.replace(/Search for terms/gi, "");
  text = text.replace(/Open Access\s*/gi, "");

  // UI element artifacts (buttons, CTAs, nav)
  text = text.replace(/\[sign me up\]/gi, "");
  text = text.replace(/\[log ?in\]/gi, "");
  text = text.replace(/\[subscribe\]/gi, "");
  text = text.replace(/\[read more\]/gi, "");
  text = text.replace(/\[view (all|more|full)\]/gi, "");

  // Markdown artifacts: images first (nested brackets), then links, then inline formatting
  text = text.replace(/!\[.*?\]\(.*?\)/g, "");
  text = text.replace(/\[!\[.*?\].*?\]/g, "");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Clean up stray markers and whitespace
  text = text.replace(/^\s*[-*|]\s+/gm, "");
  text = text.replace(/\s{2,}/g, " ");

  return text.trim();
}

function groupByYearMonth(items: Doc<"rawItems">[]): Map<string, Doc<"rawItems">[]> {
  const map = new Map<string, Doc<"rawItems">[]>();
  for (const item of items) {
    const ts = item.publishedAt ?? item._creationTime;
    const d = new Date(ts);
    const label = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(item);
  }
  return map;
}

export default function TargetTimelinePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as Id<"watchTargets">;
  const focusParam = (searchParams.get("focus") ?? "clinical_trials") as FocusValue;
  const focus = FOCUS_OPTIONS.some((o) => o.value === focusParam) ? focusParam : "clinical_trials";
  const sources = getSourcesForFocus(focus);

  const target = useQuery(api.watchTargets.get, { id });
  const items = useQuery(api.rawItems.listByWatchTarget, {
    watchTargetId: id,
    limit: 150,
    sources,
    excludeHidden: true,
  });
  const feedbackMap = useQuery(
    api.sourceLinkFeedback.getFeedbackMap,
    items ? { rawItemIds: items.map((i) => i._id) } : "skip"
  );
  const setFeedback = useMutation(api.sourceLinkFeedback.setFeedback);

  const [overlayItem, setOverlayItem] = useState<Doc<"rawItems"> | null>(null);
  const [exitingIds, setExitingIds] = useState<Set<Id<"rawItems">>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<Id<"rawItems">>>(new Set());

  const visibleItems = (items ?? []).filter(
    (i) => !hiddenIds.has(i._id) || exitingIds.has(i._id)
  );

  if (target === undefined || items === undefined) {
    return (
      <div className="stack" style={{ paddingTop: "1rem" }}>
        <div className="timeline-header">
          <h1>Timeline</h1>
        </div>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (target === null) {
    return (
      <div className="stack" style={{ paddingTop: "1rem" }}>
        <div className="timeline-header">
          <h1>Timeline</h1>
        </div>
        <p className="muted">Watch target not found.</p>
        <Link href="/targets">← Back to Watch Targets</Link>
      </div>
    );
  }

  const grouped = groupByYearMonth(visibleItems);
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const tsA = a[1][0] ? (a[1][0].publishedAt ?? a[1][0]._creationTime) : 0;
    const tsB = b[1][0] ? (b[1][0].publishedAt ?? b[1][0]._creationTime) : 0;
    return tsB - tsA;
  });

  const currentFocusLabel = FOCUS_OPTIONS.find((o) => o.value === focus)?.label ?? "All sources";

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <SourceLinkOverlay open={!!overlayItem} sourceLink={overlayItem} onClose={() => setOverlayItem(null)} />

      <nav className="timeline-breadcrumb">
        <Link href="/targets">Watch Targets</Link>
        <span className="sep">/</span>
        <Link href={`/targets/${id}`}>{target.displayName}</Link>
        <span className="sep">/</span>
        <span style={{ color: "#374151" }}>Timeline</span>
      </nav>

      <div className="timeline-header">
        <h1>Timeline</h1>
        <span className="subtitle">
          {target.displayName} — {currentFocusLabel.toLowerCase()} events ordered chronologically
        </span>
      </div>

      <div className="focus-bar" role="tablist" aria-label="Focus filter">
        {FOCUS_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={`/targets/${id}/timeline?focus=${opt.value}`}
            className="focus-pill"
            data-active={focus === opt.value}
            role="tab"
            aria-selected={focus === opt.value}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <div className="timeline-empty">
          <p>
            No {currentFocusLabel.toLowerCase()} events found yet.
          </p>
          <Link href={`/targets/${id}`}>
            ← Run a scan from {target.displayName}
          </Link>
        </div>
      ) : (
        <>
          <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
            {visibleItems.length} event{visibleItems.length !== 1 ? "s" : ""}
          </p>
          <div className="timeline-track">
            {sortedGroups.map(([yearMonth, groupItems]) => (
              <section key={yearMonth} className="timeline-month">
                <div className="timeline-month-label">
                  <span>{yearMonth}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {groupItems.map((raw) => {
                    const ts = raw.publishedAt ?? raw._creationTime;
                    const summary = cleanSummary(raw.abstract ?? raw.title);
                    const isExiting = exitingIds.has(raw._id);
                    return (
                      <div
                        key={raw._id}
                        className={`timeline-event${isExiting ? " timeline-event-exiting" : ""}`}
                        onTransitionEnd={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.propertyName !== "opacity" && e.propertyName !== "max-height")
                            return;
                          if (!exitingIds.has(raw._id)) return;
                          setFeedback({ rawItemId: raw._id, feedback: "bad" });
                          setHiddenIds((prev) => new Set(prev).add(raw._id));
                          setExitingIds((prev) => {
                            const next = new Set(prev);
                            next.delete(raw._id);
                            return next;
                          });
                        }}
                      >
                        <article className="timeline-card">
                          <div className="timeline-card-meta">
                            <SourceBadge source={raw.source as SourceType} />
                            <span className="timeline-card-date">
                              {formatTimelineDate(ts)}
                            </span>
                          </div>
                          <h3 className="timeline-card-title">{raw.title}</h3>
                          {summary && summary !== raw.title && (
                            <p className="timeline-card-summary">{summary}</p>
                          )}
                          <div className="timeline-card-actions">
                            <a
                              href={raw.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open original ↗
                            </a>
                            <button
                              type="button"
                              onClick={() => setOverlayItem(raw)}
                            >
                              View details
                            </button>
                            <span className="source-link-feedback" role="group" aria-label="Was this relevant?">
                              <button
                                type="button"
                                onClick={() => setFeedback({ rawItemId: raw._id, feedback: "good" })}
                                aria-pressed={feedbackMap?.[raw._id] === "good"}
                                aria-label="Relevant"
                                title="Relevant"
                              >
                                👍
                              </button>
                              <button
                                type="button"
                                onClick={() => setExitingIds((prev) => new Set(prev).add(raw._id))}
                                aria-pressed={feedbackMap?.[raw._id] === "bad"}
                                aria-label="Not relevant (hide from timeline)"
                                title="Not relevant (hide from timeline)"
                              >
                                👎
                              </button>
                            </span>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
