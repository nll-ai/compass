"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useConvexAuthQuerySkip } from "@/lib/convexAuthQuery";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ScanButton } from "@/components/compass/ScanButton";
import { CrossTargetConnectionsPanel } from "@/components/compass/CrossTargetConnectionsPanel";
import { formatDate, executiveSummarySnippet } from "@/lib/formatters";

type ManualScanResponse =
  | { ok: true; totalFound: number; newFound: number }
  | { ok: false; error: string };

async function postManualComprehensiveScan(
  period: "daily" | "weekly",
  targetIds: Id<"watchTargets">[],
): Promise<ManualScanResponse> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      period,
      targetIds,
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
    return { ok: false, error: data.error ?? res.statusText ?? `HTTP ${res.status}` };
  }
  if (!data.ok || typeof data.totalFound !== "number") {
    return { ok: false, error: "Unexpected response from scan" };
  }
  return {
    ok: true,
    totalFound: data.totalFound,
    newFound: typeof data.newFound === "number" ? data.newFound : 0,
  };
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function monthGroupKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function formatMonthHeading(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

type ScanHistoryEntry = Doc<"scanRuns"> & { digestRunId: Id<"digestRuns"> | null };

function groupScanHistoryByMonth(entries: ScanHistoryEntry[]) {
  const groups: { monthKey: string; label: string; entries: ScanHistoryEntry[] }[] = [];
  for (const entry of entries) {
    const t = entry.completedAt ?? entry.scheduledFor;
    const key = monthGroupKey(t);
    const last = groups[groups.length - 1];
    if (!last || last.monthKey !== key) {
      groups.push({ monthKey: key, label: formatMonthHeading(t), entries: [entry] });
    } else {
      last.entries.push(entry);
    }
  }
  return groups;
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
  viewerCanEdit: boolean;
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
            {!target.viewerCanEdit && (
              <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }} aria-label="View only">
                View only — owner can edit or delete
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
                const result = await postManualComprehensiveScan("daily", [t._id]);
                if (!result.ok) {
                  setScanError(result.error);
                } else {
                  const n = result.newFound;
                  setScanSuccess(
                    n > 0
                      ? `${t.displayName}: ${result.totalFound} items found, ${n} new. Digest updated.`
                      : `${t.displayName}: ${result.totalFound} items found, 0 new.`,
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
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const skipQueries = useConvexAuthQuerySkip();
  const targets = useQuery(api.watchTargets.listAll, skipQueries ? "skip" : {});
  const myTeam = useQuery(api.teams.getMyTeam, skipQueries ? "skip" : {});
  const runningScans = useQuery(api.scans.listRunning, skipQueries ? "skip" : {});
  const [activeTab, setActiveTab] = useState<"main" | "history" | "connections">("main");
  const scanHistory = useQuery(
    api.scans.listScanHistory,
    skipQueries || activeTab !== "history" || targets === undefined || targets.length === 0
      ? "skip"
      : { limit: 30 },
  );
  const connectionsPanelActive =
    !skipQueries && activeTab === "connections" && targets !== undefined;
  const connectionsEdgesSkip = !connectionsPanelActive || targets.length === 0;
  const subscribe = useMutation(api.targetSubscriptions.subscribe);
  const unsubscribe = useMutation(api.targetSubscriptions.unsubscribe);
  const dismissStuckScan = useMutation(api.scans.dismissStuckScanRun);
  const [scanningIds, setScanningIds] = useState<Set<Id<"watchTargets">>>(new Set());
  const [dismissingRunId, setDismissingRunId] = useState<Id<"scanRuns"> | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [historyRetryRunId, setHistoryRetryRunId] = useState<Id<"scanRuns"> | null>(null);
  const [historyScanError, setHistoryScanError] = useState<string | null>(null);
  const [historyScanSuccess, setHistoryScanSuccess] = useState<string | null>(null);
  /** Failed rows keep `error` in Convex forever; hide it on this row after user starts Re-run (restore if the request fails). */
  const [historyRowErrorDismissed, setHistoryRowErrorDismissed] = useState<Set<Id<"scanRuns">>>(
    () => new Set(),
  );

  if (convexAuthLoading) {
    return (
      <div className="stack">
        <h1>Watch Targets</h1>
        <p className="muted" role="status" aria-live="polite">
          Connecting to your workspace…
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <h1>Watch Targets</h1>
        <section className="card stack" style={{ gap: "0.5rem" }}>
          <p style={{ margin: 0 }}>Convex couldn’t verify your session.</p>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Refresh the page after signing in. If this persists, confirm <code className="muted">NEXT_PUBLIC_CONVEX_URL</code>{" "}
            matches your deployment and Convex auth (JWT) is configured for this app.
          </p>
        </section>
      </div>
    );
  }

  if (targets === undefined) {
    return (
      <div className="stack">
        <h1>Watch Targets</h1>
        <p className="muted" role="status" aria-live="polite">
          Loading watch targets…
        </p>
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
    viewerCanEdit: t.viewerCanEdit,
  }));
  const inDigest = listTargets.filter((t) => t.subscribed);
  const notInDigest = listTargets.filter((t) => !t.subscribed);
  const teamMode = myTeam !== undefined && myTeam !== null;
  const showSoloTeamHint = myTeam === null;

  return (
    <main className="stack" aria-label="Watch targets">
      <h1>Watch Targets</h1>
      <p className="muted">
        {teamMode
          ? "Use Targets for what’s in your digest and other team-wide targets. Recent scans is only completed and failed runs."
          : "Drugs, biological targets, companies, and people you're monitoring. Recent scans lists completed and failed runs."}
      </p>
      {showSoloTeamHint && (
        <section
          className="card stack"
          style={{ gap: "0.35rem", borderColor: "var(--border, #e5e7eb)" }}
          aria-label="Team workspace"
        >
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            You’re not on a team yet. Go to{" "}
            <Link href="/settings" style={{ color: "var(--link, #2563eb)", fontWeight: 600 }}>
              Settings
            </Link>{" "}
            to create a workspace or accept a team email invite — then you can share watch targets and combined digests with teammates.
          </p>
        </section>
      )}

      <div className="settings-layout">
        <nav className="settings-sidebar" aria-label="Watch targets sections">
          <div className="settings-tablist" role="tablist" aria-orientation="vertical">
            <button
              type="button"
              role="tab"
              id="targets-tab-main"
              className="settings-tab"
              aria-selected={activeTab === "main"}
              aria-controls="targets-panel-main"
              tabIndex={activeTab === "main" ? 0 : -1}
              onClick={() => setActiveTab("main")}
            >
              Targets
            </button>
            <button
              type="button"
              role="tab"
              id="targets-tab-history"
              className="settings-tab"
              aria-selected={activeTab === "history"}
              aria-controls="targets-panel-history"
              tabIndex={activeTab === "history" ? 0 : -1}
              onClick={() => setActiveTab("history")}
            >
              Recent scans
            </button>
            <button
              type="button"
              role="tab"
              id="targets-tab-connections"
              className="settings-tab"
              aria-selected={activeTab === "connections"}
              aria-controls="targets-panel-connections"
              tabIndex={activeTab === "connections" ? 0 : -1}
              onClick={() => setActiveTab("connections")}
            >
              Connections
            </button>
          </div>
        </nav>

        <div className="settings-panels stack" style={{ gap: "1rem" }}>
          <div
            id="targets-panel-main"
            role="tabpanel"
            aria-labelledby="targets-tab-main"
            hidden={activeTab !== "main"}
          >
            <div className="stack" style={{ gap: "1rem" }}>
            {scanError && (
              <p style={{ color: "var(--error, #b91c1c)", margin: 0, fontSize: "0.9rem" }} role="alert">{scanError}</p>
            )}
            {scanSuccess && (
              <p style={{ color: "var(--success, #059669)", margin: 0, fontSize: "0.9rem" }}>{scanSuccess}</p>
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
                      ? "No targets yet. Subscribe to team-wide targets below or add a new watch target."
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
                  title="Team-wide targets"
                  description="Shared with your team — subscribe to include them in your digest and scheduled scans."
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
                          flexDirection: "column",
                          gap: "0.35rem",
                          padding: "0.5rem 0",
                          borderBottom: "1px solid var(--border, #e5e7eb)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.5rem 0.75rem",
                          }}
                        >
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem 1rem", minWidth: 0 }}>
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
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexShrink: 0 }}>
                            <button
                              type="button"
                              className="button-secondary-compact"
                              disabled={dismissingRunId === run._id}
                              aria-label={`Dismiss stuck scan: ${targetNames}`}
                              onClick={async () => {
                                setScanError(null);
                                setDismissingRunId(run._id);
                                try {
                                  const result = await dismissStuckScan({ scanRunId: run._id });
                                  if (!result.ok && result.reason === "already_finished") {
                                    return;
                                  }
                                } catch (e) {
                                  setScanError(e instanceof Error ? e.message : String(e));
                                } finally {
                                  setDismissingRunId(null);
                                }
                              }}
                            >
                              {dismissingRunId === run._id ? "Dismissing…" : "Dismiss"}
                            </button>
                            <span className="muted" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>{progress}</span>
                          </div>
                        </div>
                        <p className="muted" style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.45 }}>
                          {targetNames}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            </div>
          </div>

          <div
            id="targets-panel-connections"
            role="tabpanel"
            aria-labelledby="targets-tab-connections"
            hidden={activeTab !== "connections"}
          >
            <CrossTargetConnectionsPanel
              skip={!connectionsPanelActive}
              skipEdgesQuery={connectionsEdgesSkip}
              targetCount={targets.length}
            />
          </div>

          <div
            id="targets-panel-history"
            role="tabpanel"
            aria-labelledby="targets-tab-history"
            hidden={activeTab !== "history"}
          >
            {targets.length === 0 ? (
              <section className="card stack" style={{ gap: "0.75rem" }} aria-label="Recent scans">
                <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Recent scans</h2>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  Add a watch target first, then completed and failed runs will appear here.
                </p>
                <Link href="/targets/new" className="link" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  Add your first watch target
                </Link>
              </section>
            ) : (
              <section className="card stack" style={{ gap: "0.75rem" }} aria-label="Recent scans">
                <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Recent scans</h2>
                {historyScanError ? (
                  <p style={{ color: "var(--error, #b91c1c)", margin: 0, fontSize: "0.9rem" }} role="alert">
                    {historyScanError}
                  </p>
                ) : null}
                {historyScanSuccess ? (
                  <p style={{ color: "var(--success, #059669)", margin: 0, fontSize: "0.9rem" }} role="status">
                    {historyScanSuccess}
                  </p>
                ) : null}
                {scanHistory === undefined ? (
                  <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }} role="status">
                    Loading scan history…
                  </p>
                ) : scanHistory.length === 0 ? (
                  <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                    No scan history yet. Run a scan from a target card on the Targets tab.
                  </p>
                ) : (
                  <>
                    <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                      Completed and failed runs for your watch targets, newest first. Open a digest when one was generated for that run. On a failed row, Re-run starts a new comprehensive scan with the same targets and daily or weekly period.
                    </p>
                    {groupScanHistoryByMonth(scanHistory).map((group) => (
                      <div key={group.monthKey} className="scan-history-month">
                        <p className="scan-history-month-label">{group.label}</p>
                        <ul className="scan-history-list">
                          {group.entries.map((entry) => {
                            const { digestRunId, ...run } = entry;
                            const targetNames =
                              run.targetIds
                                ?.map((id) => targetById.get(id)?.displayName)
                                .filter(Boolean)
                                .join(", ") ?? "—";
                            const when = run.completedAt ?? run.scheduledFor;
                            const whenLabel = `${formatDate(when)} ${formatTime(when)}`;
                            const isFailed = run.status === "failed";
                            return (
                              <li key={run._id}>
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "0.35rem 0.75rem",
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <span
                                      style={{
                                        fontSize: "0.85rem",
                                        fontWeight: 600,
                                        color: isFailed ? "var(--error, #b91c1c)" : "var(--ink, #111827)",
                                      }}
                                    >
                                      {isFailed ? "Failed" : "Completed"}
                                    </span>
                                    <span className="muted" style={{ fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                                      {whenLabel}
                                    </span>
                                    <span className="muted" style={{ fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                                      {run.period === "weekly" ? "Weekly" : "Daily"}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      alignItems: "center",
                                      gap: "0.5rem 0.75rem",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {digestRunId ? (
                                      <Link
                                        href={`/digest/${digestRunId}`}
                                        className="link"
                                        style={{ fontSize: "0.85rem", fontWeight: 600 }}
                                        aria-label={`View digest for scan on ${formatDate(when)}`}
                                      >
                                        View digest
                                      </Link>
                                    ) : null}
                                    {isFailed && run.targetIds && run.targetIds.length > 0 ? (
                                      <button
                                        type="button"
                                        className="link link-as-button"
                                        style={{ fontSize: "0.85rem", fontWeight: 600 }}
                                        disabled={historyRetryRunId !== null}
                                        aria-busy={historyRetryRunId === run._id}
                                        aria-label={`Re-run scan for ${targetNames}`}
                                        onClick={async () => {
                                          setHistoryScanError(null);
                                          setHistoryScanSuccess(null);
                                          setHistoryRowErrorDismissed((prev) => new Set(prev).add(run._id));
                                          setHistoryRetryRunId(run._id);
                                          try {
                                            const result = await postManualComprehensiveScan(run.period, run.targetIds!);
                                            if (!result.ok) {
                                              setHistoryRowErrorDismissed((prev) => {
                                                const next = new Set(prev);
                                                next.delete(run._id);
                                                return next;
                                              });
                                              setHistoryScanError(result.error);
                                            } else {
                                              const n = result.newFound;
                                              setHistoryScanSuccess(
                                                n > 0
                                                  ? `${result.totalFound} items found, ${n} new. Digest updated if applicable.`
                                                  : `${result.totalFound} items found, 0 new.`,
                                              );
                                              setTimeout(() => setHistoryScanSuccess(null), 10000);
                                            }
                                          } catch (e) {
                                            setHistoryRowErrorDismissed((prev) => {
                                              const next = new Set(prev);
                                              next.delete(run._id);
                                              return next;
                                            });
                                            setHistoryScanError(e instanceof Error ? e.message : String(e));
                                          } finally {
                                            setHistoryRetryRunId(null);
                                          }
                                        }}
                                      >
                                        {historyRetryRunId === run._id ? "Running…" : "Re-run"}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", lineHeight: 1.45 }}>
                                  {targetNames}
                                </p>
                                <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.85rem" }}>
                                  {isFailed
                                    ? "Scan did not finish successfully."
                                    : `${run.newItemsFound ?? 0} new · ${run.totalItemsFound ?? 0} total items · ${run.sourcesCompleted ?? 0}/${run.sourcesTotal} sources`}
                                </p>
                                {isFailed &&
                                run.error &&
                                !historyRowErrorDismissed.has(run._id) ? (
                                  <p
                                    style={{
                                      margin: "0.25rem 0 0",
                                      fontSize: "0.85rem",
                                      lineHeight: 1.4,
                                      display: "-webkit-box",
                                      WebkitLineClamp: 3,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                      color: "var(--error, #b91c1c)",
                                    }}
                                  >
                                    {run.error}
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
