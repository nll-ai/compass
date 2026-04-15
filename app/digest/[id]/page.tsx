"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ExecutiveSummaryBanner } from "@/components/compass/ExecutiveSummaryBanner";
import { DigestItemCard } from "@/components/compass/DigestItemCard";
import { DecisionBriefCard } from "@/components/compass/DecisionBriefCard";
import { SignalOverlay } from "@/components/compass/SignalOverlay";
import { formatDate } from "@/lib/formatters";
import type { DigestItem } from "@/lib/types";
import { trackDigestDetailViewed } from "@/lib/telemetry/decisionDigest";

export default function DigestDetailPage() {
  const params = useParams();
  const id = params.id as Id<"digestRuns">;
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const skipConvex = convexAuthLoading || !isAuthenticated;
  const digestRun = useQuery(api.digestRuns.get, skipConvex ? "skip" : { id });
  const items = useQuery(api.digestItems.listByDigestRun, skipConvex ? "skip" : { digestRunId: id });
  const teamMembers = useQuery(api.teams.listTeamMembers, skipConvex ? "skip" : {});
  const me = useQuery(api.users.getMe, skipConvex ? "skip" : {});
  const [overlayItem, setOverlayItem] = useState<DigestItem | null>(null);

  useEffect(() => {
    if (digestRun) {
      trackDigestDetailViewed({
        digestRunId: String(id),
        hasDecisionBrief: Boolean(
          digestRun.deltaSummary?.trim() ||
            digestRun.materialitySummary?.trim() ||
            digestRun.recommendedActionsSummary?.trim() ||
            digestRun.strategicReadSummary?.trim() ||
            digestRun.confidence,
        ),
      });
    }
  }, [digestRun, id]);

  if (convexAuthLoading) {
    return (
      <div className="stack">
        <h1>Digest</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <h1>Digest</h1>
        <p className="muted">Sign in to view this digest.</p>
        <Link href="/sign-in" className="muted">
          Sign in
        </Link>
      </div>
    );
  }

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
        <Link href="/targets" className="muted">
          ← Watch Targets
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <SignalOverlay open={!!overlayItem} item={overlayItem} onClose={() => setOverlayItem(null)} />
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <Link href="/targets">Digests</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        {formatDate(digestRun.generatedAt)}
      </nav>
      <h1 style={{ margin: 0 }}>
        {digestRun.period === "weekly" ? "Weekly" : "Daily"} digest · {formatDate(digestRun.generatedAt)}
      </h1>
      <DecisionBriefCard
        digestRunId={String(id)}
        deltaSummary={digestRun.deltaSummary}
        materialitySummary={digestRun.materialitySummary}
        recommendedActionsSummary={digestRun.recommendedActionsSummary}
        strategicReadSummary={digestRun.strategicReadSummary}
        confidence={digestRun.confidence}
      />
      <ExecutiveSummaryBanner summary={digestRun.executiveSummary} />
      <section className="stack">
        <h2 style={{ margin: 0 }}>Signals ({items.length})</h2>
        {items.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>No items in this digest.</p>
          </div>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((item) => {
              const digestItem: DigestItem = {
                _id: item._id,
                digestRunId: item.digestRunId,
                watchTargetId: item.watchTargetId,
                category: item.category,
                significance: item.significance,
                headline: item.headline,
                synthesis: item.synthesis,
                strategicImplication: item.strategicImplication,
                sources: item.sources,
                rawItemIds: item.rawItemIds,
                reviewedAt: item.reviewedAt,
                feedback: item.feedback,
                feedbackAt: item.feedbackAt,
                workflowStatus: item.workflowStatus,
                assigneeUserId: item.assigneeUserId,
                workflowUpdatedAt: item.workflowUpdatedAt,
              };
              const memberOpts =
                teamMembers?.map((m) => ({ _id: m._id as string, email: m.email })) ?? [];
              return (
                <li key={item._id}>
                  <DigestItemCard
                    item={digestItem}
                    onOpenInOverlay={() => setOverlayItem(digestItem)}
                    teamMembers={memberOpts.length > 0 ? memberOpts : undefined}
                    currentUserId={me?._id as string | undefined}
                    currentUserEmail={me?.email}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
