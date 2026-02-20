"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ExecutiveSummaryBanner } from "@/components/compass/ExecutiveSummaryBanner";
import { DigestItemCard } from "@/components/compass/DigestItemCard";
import { formatDate } from "@/lib/formatters";

export default function DigestDetailPage() {
  const params = useParams();
  const id = params.id as Id<"digestRuns">;
  const digestRun = useQuery(api.digestRuns.get, { id });
  const items = useQuery(api.digestItems.listByDigestRun, { digestRunId: id });

  if (digestRun === undefined || items === undefined) {
    return (
      <div className="stack">
        <h1>Digest</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (digestRun === null) {
    return (
      <div className="stack">
        <h1>Digest not found</h1>
        <p className="muted">This digest run may have been removed.</p>
        <Link href="/history" className="muted">← Back to history</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <Link href="/history">Digests</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        {formatDate(digestRun.generatedAt)}
      </nav>
      <h1 style={{ margin: 0 }}>
        {digestRun.period === "weekly" ? "Weekly" : "Daily"} digest · {formatDate(digestRun.generatedAt)}
      </h1>
      <ExecutiveSummaryBanner summary={digestRun.executiveSummary} />
      <section className="stack">
        <h2 style={{ margin: 0 }}>Signals ({items.length})</h2>
        {items.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>No items in this digest.</p>
          </div>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((item) => (
              <li key={item._id}>
                <DigestItemCard
                  item={{
                    _id: item._id,
                    digestRunId: item.digestRunId,
                    watchTargetId: item.watchTargetId,
                    category: item.category,
                    significance: item.significance,
                    headline: item.headline,
                    synthesis: item.synthesis,
                    strategicImplication: item.strategicImplication,
                    sources: item.sources,
                    reviewedAt: item.reviewedAt,
                    feedback: item.feedback,
                    feedbackAt: item.feedbackAt,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
