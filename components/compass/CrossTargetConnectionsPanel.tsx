"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatDate } from "@/lib/formatters";

type EdgeRow = {
  _id: Id<"graphCrossTargetEdges">;
  linkKey: string;
  lastSeenAt: number;
  watchTargetIdA: Id<"watchTargets">;
  watchTargetIdB: Id<"watchTargets">;
  displayNameA: string;
  displayNameB: string;
  rawItemIds: Id<"rawItems">[];
};

function parseLinkKey(linkKey: string): { source: string; id: string } {
  const i = linkKey.indexOf(":");
  if (i <= 0) return { source: "—", id: linkKey };
  return { source: linkKey.slice(0, i), id: linkKey.slice(i + 1) };
}

type PairGroup = {
  pairKey: string;
  watchTargetIdA: Id<"watchTargets">;
  watchTargetIdB: Id<"watchTargets">;
  displayNameA: string;
  displayNameB: string;
  edgeCount: number;
  sourcesUnique: string[];
  lastSeenAt: number;
  mergedRawItemIds: Id<"rawItems">[];
};

function groupEdgesIntoPairs(edges: EdgeRow[]): PairGroup[] {
  const byPair = new Map<string, EdgeRow[]>();
  for (const e of edges) {
    const k = `${e.watchTargetIdA}|${e.watchTargetIdB}`;
    const list = byPair.get(k) ?? [];
    list.push(e);
    byPair.set(k, list);
  }
  const groups: PairGroup[] = [];
  for (const [, groupEdges] of byPair) {
    const first = groupEdges[0]!;
    const sourcesUnique = [
      ...new Set(groupEdges.map((x) => parseLinkKey(x.linkKey).source)),
    ].sort();
    const lastSeenAt = Math.max(...groupEdges.map((x) => x.lastSeenAt));
    const idSet = new Set<Id<"rawItems">>();
    for (const e of groupEdges) {
      for (const id of e.rawItemIds) idSet.add(id);
    }
    groups.push({
      pairKey: `${first.watchTargetIdA}|${first.watchTargetIdB}`,
      watchTargetIdA: first.watchTargetIdA,
      watchTargetIdB: first.watchTargetIdB,
      displayNameA: first.displayNameA,
      displayNameB: first.displayNameB,
      edgeCount: groupEdges.length,
      sourcesUnique,
      lastSeenAt,
      mergedRawItemIds: [...idSet],
    });
  }
  groups.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return groups;
}

function evidenceByUrl(rows: Doc<"rawItems">[]): { canonical: Doc<"rawItems">; sameUrl: Doc<"rawItems">[] }[] {
  const byUrl = new Map<string, Doc<"rawItems">[]>();
  for (const r of rows) {
    const key = r.url.trim() || String(r._id);
    const list = byUrl.get(key) ?? [];
    list.push(r);
    byUrl.set(key, list);
  }
  return [...byUrl.values()].map((sameUrl) => ({
    canonical: sameUrl[0]!,
    sameUrl,
  }));
}

export function CrossTargetConnectionsPanel({
  skip,
  skipEdgesQuery,
  targetCount,
}: {
  /** When true, the panel is not shown (wrong tab or targets still loading). */
  skip: boolean;
  /** When true, do not subscribe to `listEdgesForViewer` (no targets yet or panel inactive). */
  skipEdgesQuery: boolean;
  /** Visible watch targets count (for empty state copy). */
  targetCount: number;
}) {
  const edges = useQuery(
    api.crossTargetGraph.listEdgesForViewer,
    skipEdgesQuery ? "skip" : {},
  );
  const scheduleReconcile = useMutation(api.crossTargetGraph.scheduleReconcileForMyVisibleTargets);
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);

  const pairGroups = useMemo(
    () => (edges !== undefined ? groupEdgesIntoPairs(edges as EdgeRow[]) : []),
    [edges],
  );

  const selectedGroup =
    selectedPairKey != null ? pairGroups.find((g) => g.pairKey === selectedPairKey) : undefined;

  const evidence = useQuery(
    api.rawItems.getByIds,
    selectedGroup && selectedGroup.mergedRawItemIds.length > 0
      ? { ids: selectedGroup.mergedRawItemIds }
      : "skip",
  );

  const evidenceDeduped = useMemo(
    () => (evidence !== undefined ? evidenceByUrl(evidence) : []),
    [evidence],
  );

  const targetLabel = useMemo(() => {
    if (!selectedGroup) return new Map<Id<"watchTargets">, string>();
    return new Map<Id<"watchTargets">, string>([
      [selectedGroup.watchTargetIdA, selectedGroup.displayNameA],
      [selectedGroup.watchTargetIdB, selectedGroup.displayNameB],
    ]);
  }, [selectedGroup]);

  useEffect(() => {
    if (
      selectedPairKey != null &&
      pairGroups.length > 0 &&
      !pairGroups.some((g) => g.pairKey === selectedPairKey)
    ) {
      setSelectedPairKey(null);
    }
  }, [pairGroups, selectedPairKey]);

  useEffect(() => {
    if (pairGroups.length > 0 && selectedPairKey === null) {
      setSelectedPairKey(pairGroups[0]!.pairKey);
    }
  }, [pairGroups, selectedPairKey]);

  if (skip) {
    return null;
  }

  if (targetCount < 2) {
    return (
      <section className="card stack" style={{ gap: "0.75rem" }} aria-label="Connections">
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Connections</h2>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Add at least two watch targets to see where the same source document appears under more than one target
          (for example, the same PubMed article or clinical trial for two drugs or a company and a program).
        </p>
      </section>
    );
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <section className="card stack" style={{ gap: "0.75rem" }} aria-label="Connections overview">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div className="stack" style={{ gap: "0.35rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Connections</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem", maxWidth: "42rem", lineHeight: 1.5 }}>
              One row per target pair. Shared documents are grouped on the right; duplicate URLs from different targets
              show once with both targets linked.
            </p>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={reconcileBusy}
            aria-busy={reconcileBusy}
            onClick={async () => {
              setReconcileBusy(true);
              try {
                await scheduleReconcile({});
              } finally {
                setReconcileBusy(false);
              }
            }}
          >
            {reconcileBusy ? "Refreshing…" : "Refresh graph"}
          </button>
        </div>
      </section>

      {edges === undefined ? (
        <p className="muted" role="status" aria-live="polite">
          Loading connections…
        </p>
      ) : edges.length === 0 ? (
        <section className="card stack" style={{ gap: "0.5rem" }}>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            No shared documents yet across your watch targets. After scans retrieve the same paper, trial, or filing for
            two targets, connections appear here. Use Refresh graph if you expected links from older scans.
          </p>
        </section>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "1rem",
            alignItems: "start",
          }}
          className="connections-split"
        >
          <section className="card stack" style={{ gap: "0.5rem" }} aria-label="Target pairs with shared documents">
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Target pairs</h3>
            <ul className="stack connections-edge-list" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.35rem" }}>
              {pairGroups.map((g) => {
                const active = selectedPairKey === g.pairKey;
                const docLabel = g.edgeCount === 1 ? "1 shared document" : `${g.edgeCount} shared documents`;
                return (
                  <li key={g.pairKey}>
                    <button
                      type="button"
                      onClick={() => setSelectedPairKey(g.pairKey)}
                      className="connections-row-button"
                      aria-pressed={active}
                      aria-label={`${g.displayNameA} and ${g.displayNameB}, ${docLabel}`}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "0.5rem 0.65rem",
                        borderRadius: "8px",
                        border: `1px solid ${active ? "var(--border-hover, #d1d5db)" : "var(--border, #e5e7eb)"}`,
                        background: active ? "var(--surface-secondary, #f3f4f6)" : "var(--surface, #fff)",
                        cursor: "pointer",
                        transition: "border-color 0.2s ease, background 0.2s ease",
                      }}
                    >
                      <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--ink, #111827)" }}>
                        {g.displayNameA}
                        <span className="muted" style={{ fontWeight: 500, margin: "0 0.35rem" }}>
                          ·
                        </span>
                        {g.displayNameB}
                      </span>
                      <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", lineHeight: 1.4 }}>
                        {docLabel}
                        <span aria-hidden="true"> · </span>
                        Updated {formatDate(g.lastSeenAt)}
                      </p>
                      <div
                        style={{
                          marginTop: "0.3rem",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.3rem",
                          alignItems: "center",
                        }}
                      >
                        {g.sourcesUnique.map((src) => (
                          <span key={src} className="source-badge" data-source={src}>
                            {src}
                          </span>
                        ))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            className="card stack"
            style={{ gap: "0.65rem" }}
            aria-label="Evidence for selected target pair"
          >
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Shared sources</h3>
            {!selectedGroup ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                Select a target pair to see deduplicated links (same URL appears once).
              </p>
            ) : evidence === undefined ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }} role="status">
                Loading evidence…
              </p>
            ) : evidence.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                No accessible source rows (they may have been removed).
              </p>
            ) : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.65rem" }}>
                {evidenceDeduped.map(({ canonical, sameUrl }) => {
                  const targetIds = [...new Set(sameUrl.map((r) => r.watchTargetId))];
                  return (
                    <li
                      key={canonical._id}
                      style={{
                        paddingBottom: "0.65rem",
                        borderBottom: "1px solid var(--border, #e5e7eb)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.35rem",
                          alignItems: "center",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <span className="source-badge" data-source={canonical.source}>
                          {canonical.source}
                        </span>
                        {targetIds.map((tid) => (
                          <Link
                            key={tid}
                            href={`/targets/${tid}`}
                            className="muted"
                            style={{ fontSize: "0.8rem", fontWeight: 500 }}
                          >
                            {targetLabel.get(tid) ?? "Target"}
                          </Link>
                        ))}
                      </div>
                      <a
                        href={canonical.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: 600,
                          lineHeight: 1.35,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {canonical.title}
                      </a>
                      {canonical.publishedAt != null ? (
                        <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                          {formatDate(canonical.publishedAt)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
