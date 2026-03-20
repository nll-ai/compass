"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ScanButton } from "@/components/compass/ScanButton";
import { formatDate, executiveSummarySnippet } from "@/lib/formatters";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

type ListTarget = {
  _id: Id<"watchTargets">;
  displayName: string;
  type: string;
  therapeuticArea: string;
  affiliation?: string;
  active: boolean;
  subscribed: boolean;
  creatorLabel?: string;
};

function TargetCard({
  target,
  isScanning,
  onScan,
  setScanError,
  showSubscribeToggle,
  onSubscribeChange,
}: {
  target: ListTarget;
  isScanning: boolean;
  onScan: () => Promise<void>;
  setScanError: (msg: string | null) => void;
  showSubscribeToggle: boolean;
  onSubscribeChange: (subscribed: boolean) => Promise<void>;
}) {
  const latestDigest = useQuery(api.digestRuns.getLatestForTarget, { watchTargetId: target._id });
  const [toggleBusy, setToggleBusy] = useState(false);

  const typeBadge = target.type === "person" ? "Researcher" : target.type.charAt(0).toUpperCase() + target.type.slice(1);
  const meta = target.type === "person" && target.affiliation
    ? `${typeBadge} · ${target.affiliation}`
    : `${typeBadge} · ${target.therapeuticArea}`;

  return (
    <li>
      <article className="card stack" style={{ gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <Link
              href={`/targets/${target._id}`}
              style={{ fontWeight: 600, color: "inherit", textDecoration: "none", fontSize: "1rem" }}
            >
              {target.displayName}
            </Link>
            <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.85rem" }}>{meta}</p>
            {target.creatorLabel && (
              <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                Added by {target.creatorLabel}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {showSubscribeToggle && (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  cursor: toggleBusy ? "wait" : "pointer",
                  fontSize: "0.85rem",
                  color: "var(--muted, #6b7280)",
                }}
              >
                <input
                  type="checkbox"
                  checked={target.subscribed}
                  disabled={toggleBusy}
                  onChange={async (e) => {
                    setToggleBusy(true);
                    try {
                      await onSubscribeChange(e.target.checked);
                    } finally {
                      setToggleBusy(false);
                    }
                  }}
                  aria-label={`Include ${target.displayName} in combined digest and scheduled scans`}
                />
                <span>In digest</span>
              </label>
            )}
            <ScanButton
              onScan={async () => {
                setScanError(null);
                await onScan();
              }}
              isScanning={isScanning}
              size="compact"
            />
          </div>
        </div>
        {latestDigest === undefined ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Loading digest…</p>
        ) : latestDigest ? (
          <div style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: "0.4rem" }}>
            <Link
              href={`/digest/${latestDigest._id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {formatDate(latestDigest.generatedAt)} · {latestDigest.totalSignals} signals
                {latestDigest.criticalCount > 0 && ` · ${latestDigest.criticalCount} critical`}
              </span>
              <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {executiveSummarySnippet(latestDigest.executiveSummary, 120)}
              </p>
            </Link>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>No digest yet. Run a scan to generate one.</p>
        )}
      </article>
    </li>
  );
}

function TargetListSection({
  title,
  description,
  targets,
  emptyHint,
  scanningIds,
  setScanError,
  setScanSuccess,
  setScanningIds,
  showSubscribeToggle,
  subscribe,
  unsubscribe,
}: {
  title: string;
  description?: string;
  targets: ListTarget[];
  /** When the list is empty, show this message instead of hiding the section. */
  emptyHint?: string;
  scanningIds: Set<Id<"watchTargets">>;
  setScanError: (msg: string | null) => void;
  setScanSuccess: (msg: string | null) => void;
  setScanningIds: Dispatch<SetStateAction<Set<Id<"watchTargets">>>>;
  showSubscribeToggle: boolean;
  subscribe: (args: { watchTargetId: Id<"watchTargets"> }) => Promise<unknown>;
  unsubscribe: (args: { watchTargetId: Id<"watchTargets"> }) => Promise<unknown>;
}) {
  if (targets.length === 0) {
    if (!emptyHint) return null;
    return (
      <section className="stack" style={{ gap: "0.5rem" }} aria-label={title}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h2>
        {description && (
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>{description}</p>
        )}
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>{emptyHint}</p>
      </section>
    );
  }
  return (
    <section className="stack" style={{ gap: "0.5rem" }} aria-label={title}>
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h2>
      {description && (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>{description}</p>
      )}
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.75rem" }}>
        {targets.map((t) => (
          <TargetCard
            key={t._id}
            target={t}
            isScanning={scanningIds.has(t._id)}
            setScanError={setScanError}
            showSubscribeToggle={showSubscribeToggle}
            onSubscribeChange={async (subscribed) => {
              if (subscribed) await subscribe({ watchTargetId: t._id });
              else await unsubscribe({ watchTargetId: t._id });
            }}
            onScan={async () => {
              setScanError(null);
              setScanSuccess(null);
              setScanningIds((prev) => new Set(prev).add(t._id));
              try {
                const res = await fetch("/api/scan", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    period: "daily",
                    targetIds: [t._id],
                    mode: "comprehensive",
                  }),
                });
                const text = await res.text();
                let data: { ok?: boolean; error?: string; totalFound?: number; newFound?: number };
                try {
                  data = text ? (JSON.parse(text) as typeof data) : {};
                } catch {
                  data = { error: text.startsWith("<") ? "Unexpected response (redirect?)" : text };
                }
                if (!res.ok || data.error) {
                  setScanError(data.error ?? res.statusText ?? `HTTP ${res.status}`);
                } else if (data.ok && typeof data.totalFound === "number") {
                  const n = typeof data.newFound === "number" ? data.newFound : 0;
                  setScanSuccess(
                    n > 0
                      ? `${t.displayName}: ${data.totalFound} items found, ${n} new. Digest updated.`
                      : `${t.displayName}: ${data.totalFound} items found, 0 new.`
                  );
                  setTimeout(() => setScanSuccess(null), 8000);
                }
              } catch (e) {
                setScanError(e instanceof Error ? e.message : String(e));
              } finally {
                setScanningIds((prev) => {
                  const next = new Set(prev);
                  next.delete(t._id);
                  return next;
                });
              }
            }}
          />
        ))}
      </ul>
    </section>
  );
}

export default function TargetsPage() {
  const targets = useQuery(api.watchTargets.listAll);
  const myTeam = useQuery(api.teams.getMyTeam);
  const runningScans = useQuery(api.scans.listRunning);
  const subscribe = useMutation(api.targetSubscriptions.subscribe);
  const unsubscribe = useMutation(api.targetSubscriptions.unsubscribe);
  const [scanningIds, setScanningIds] = useState<Set<Id<"watchTargets">>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  if (targets === undefined) {
    return (
      <div className="stack">
        <h1>Watch Targets</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const targetById = new Map(targets.map((t) => [t._id, t]));
  const listTargets: ListTarget[] = targets.map((t) => ({
    _id: t._id,
    displayName: t.displayName,
    type: t.type,
    therapeuticArea: t.therapeuticArea,
    affiliation: t.affiliation,
    active: t.active,
    subscribed: t.subscribed,
    creatorLabel: t.creatorLabel,
  }));
  const inDigest = listTargets.filter((t) => t.subscribed);
  const notInDigest = listTargets.filter((t) => !t.subscribed);
  const teamMode = myTeam !== undefined && myTeam !== null;

  return (
    <main className="stack" aria-label="Watch targets">
      <h1>Watch Targets</h1>
      <p className="muted">
        {teamMode
          ? "Team watch targets. Check “In digest” for targets included in your combined email and global schedule."
          : "Drugs, biological targets, companies, and people you're monitoring."}
      </p>

      {scanError && (
        <p style={{ color: "var(--error, #b91c1c)", margin: 0, fontSize: "0.9rem" }} role="alert">{scanError}</p>
      )}
      {scanSuccess && (
        <p style={{ color: "var(--success, #059669)", margin: 0, fontSize: "0.9rem" }}>{scanSuccess}</p>
      )}

      {runningScans !== undefined && runningScans.length > 0 && (
        <section className="card stack" style={{ gap: "0.75rem" }} aria-label="Running scans">
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Running scans</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Scans currently pending or in progress. This list updates automatically.
          </p>
          <ul className="running-scan-list stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.5rem" }}>
            {runningScans.map((run) => {
              const targetNames =
                run.targetIds
                  ?.map((id) => targetById.get(id)?.displayName)
                  .filter(Boolean)
                  .join(", ") ?? "—";
              const time =
                run.status === "running" && run.startedAt != null
                  ? `Started ${formatDate(run.startedAt)} ${formatTime(run.startedAt)}`
                  : `Scheduled ${formatDate(run.scheduledFor)} ${formatTime(run.scheduledFor)}`;
              const progress = `${run.sourcesCompleted ?? 0}/${run.sourcesTotal} sources`;
              return (
                <li
                  key={run._id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.5rem 1rem",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border, #e5e7eb)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: run.status === "running" ? "var(--link, #2563eb)" : "var(--muted, #6b7280)",
                    }}
                  >
                    {run.status === "running" ? "Running" : "Pending"}
                  </span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>{time}</span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>{targetNames}</span>
                  <span className="muted" style={{ fontSize: "0.85rem", marginLeft: "auto" }}>{progress}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Link
        href="/targets/new"
        className="card muted"
        style={{ display: "inline-block", padding: "0.5rem 1rem" }}
      >
        + Add Watch Target
      </Link>

      {targets.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No watch targets yet. <Link href="/targets/new">Add your first watch target</Link>.
          </p>
        </div>
      ) : teamMode ? (
        <div className="stack" style={{ gap: "1.25rem" }}>
          <TargetListSection
            title="In your digest"
            description="Included in combined digest emails and your Settings digest schedule."
            targets={inDigest}
            emptyHint={
              inDigest.length === 0
                ? "No targets yet. Subscribe to team targets below or add a new watch target."
                : undefined
            }
            scanningIds={scanningIds}
            setScanError={setScanError}
            setScanSuccess={setScanSuccess}
            setScanningIds={setScanningIds}
            showSubscribeToggle
            subscribe={subscribe}
            unsubscribe={unsubscribe}
          />
          <TargetListSection
            title="Other team targets"
            description="Subscribe to add them to your digest and scheduled scans."
            targets={notInDigest}
            scanningIds={scanningIds}
            setScanError={setScanError}
            setScanSuccess={setScanSuccess}
            setScanningIds={setScanningIds}
            showSubscribeToggle
            subscribe={subscribe}
            unsubscribe={unsubscribe}
          />
        </div>
      ) : (
        <TargetListSection
          title="Watch targets"
          targets={listTargets}
          scanningIds={scanningIds}
          setScanError={setScanError}
          setScanSuccess={setScanSuccess}
          setScanningIds={setScanningIds}
          showSubscribeToggle={teamMode}
          subscribe={subscribe}
          unsubscribe={unsubscribe}
        />
      )}
    </main>
  );
}
