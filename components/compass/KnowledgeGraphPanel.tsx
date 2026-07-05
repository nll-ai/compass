"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const TYPE_LABELS: Record<string, string> = {
  drug: "Drugs targeting this",
  company: "Developers",
  indication: "Indications",
  target: "Related targets",
  mechanism: "Mechanisms",
  trial: "Trials",
  person: "People",
};
const TYPE_ORDER = ["drug", "company", "indication", "target", "mechanism", "trial", "person"];

export function KnowledgeGraphPanel({ watchTargetId }: { watchTargetId: Id<"watchTargets"> }) {
  const data = useQuery(api.entities.getNeighborhood, { watchTargetId });

  return (
    <section className="card stack" aria-labelledby="kg-heading">
      <h2 id="kg-heading" style={{ margin: 0 }}>
        Knowledge graph
      </h2>
      {data === undefined ? (
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      ) : data === null ? (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Assembling the knowledge graph from open biomedical sources (UniProt, Open Targets,
          ChEMBL). This appears shortly after target creation for supported entity types (drug,
          target, company).
        </p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            {data.central.displayName} — neighborhood from open biomedical sources. Each link carries
            its source and a confidence score.
          </p>
          {(() => {
            const groups = new Map<string, typeof data.neighbors>();
            for (const n of data.neighbors) {
              const arr = groups.get(n.entity.type) ?? [];
              arr.push(n);
              groups.set(n.entity.type, arr);
            }
            const ordered = TYPE_ORDER.filter((t) => groups.has(t));
            if (ordered.length === 0) {
              return (
                <p className="muted" style={{ margin: 0 }}>
                  No backbone relationships found for this entity yet.
                </p>
              );
            }
            return ordered.map((t) => {
              const rows = groups.get(t)!;
              return (
                <div key={t} className="stack" style={{ gap: "0.4rem" }}>
                  <h3 style={{ margin: 0, fontSize: "0.95rem" }}>
                    {TYPE_LABELS[t] ?? t}{" "}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      ({rows.length})
                    </span>
                  </h3>
                  <ul
                    className="stack"
                    style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.35rem" }}
                  >
                    {rows.map((n) => {
                      const ev = n.evidence[0];
                      const pct = Math.round((n.confidence ?? 0) * 100);
                      return (
                        <li
                          key={n.entity._id}
                          className="card"
                          style={{
                            padding: "0.5rem 0.75rem",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{n.entity.displayName}</span>
                          <span
                            className="muted"
                            style={{
                              display: "flex",
                              gap: "0.75rem",
                              alignItems: "center",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span title="confidence">{pct}%</span>
                            {ev?.url ? (
                              <a
                                className="link"
                                href={ev.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                source ↗
                              </a>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            });
          })()}
        </>
      )}
    </section>
  );
}
