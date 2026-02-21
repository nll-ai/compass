"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/formatters";

export default function HistoryPage() {
  const digestRuns = useQuery(api.digestRuns.listRecent, { limit: 30 });

  if (digestRuns === undefined) {
    return (
      <div className="stack">
        <h1>Digest history</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Digest history</h1>
      <p className="muted">Past digest runs, newest first.</p>
      {digestRuns.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No digest runs yet. Run a scan from the <Link href="/">dashboard</Link> or <Link href="/targets">Watch Targets</Link>.
          </p>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {digestRuns.map((run) => (
            <li key={run._id}>
              <Link
                href={`/digest/${run._id}`}
                className="card"
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span style={{ fontWeight: 600 }}>{formatDate(run.generatedAt)}</span>
                <span className="muted" style={{ marginLeft: "0.5rem" }}>
                  {run.period} · {run.totalSignals} signals
                  {run.criticalCount > 0 && ` · ${run.criticalCount} critical`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
