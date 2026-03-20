"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ScanButton } from "@/components/compass/ScanButton";
import { formatDate, executiveSummarySnippet } from "@/lib/formatters";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function TargetCard({
  target,
  isScanning,
  onScan,
  setScanError,
}: {
  target: {
    _id: Id<"watchTargets">;
    displayName: string;
    type: string;
    therapeuticArea: string;
    affiliation?: string;
    active: boolean;
  };
  isScanning: boolean;
  onScan: () => Promise<void>;
  setScanError: (msg: string | null) => void;
}) {
  const latestDigest = useQuery(api.digestRuns.getLatestForTarget, { watchTargetId: target._id });

  const typeBadge = target.type === "person" ? "Researcher" : target.type.charAt(0).toUpperCase() + target.type.slice(1);
  const meta = target.type === "person" && target.affiliation
    ? `${typeBadge} · ${target.affiliation}`
    : `${typeBadge} · ${target.therapeuticArea}`;

  return (
    <li>
      <article className="card stack" style={{ gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <Link
              href={`/targets/${target._id}`}
              style={{ fontWeight: 600, color: "inherit", textDecoration: "none", fontSize: "1rem" }}
            >
              {target.displayName}
            </Link>
            <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.85rem" }}>{meta}</p>
          </div>
          <ScanButton
            onScan={async () => {
              setScanError(null);
              await onScan();
            }}
            isScanning={isScanning}
            size="compact"
          />
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

export default function TargetsPage() {
  const targets = useQuery(api.watchTargets.listAll);
  const runningScans = useQuery(api.scans.listRunning);
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

  const targetById = new Map(targets?.map((t) => [t._id, t]) ?? []);

  return (
    <div className="stack">
      <h1>Watch Targets</h1>
      <p className="muted">Drugs, biological targets, companies, and people you're monitoring.</p>

      {scanError && (
        <p style={{ color: "var(--error, #b91c1c)", margin: 0, fontSize: "0.9rem" }}>{scanError}</p>
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
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.75rem" }}>
          {targets.map((t) => (
            <TargetCard
              key={t._id}
              target={{
                _id: t._id,
                displayName: t.displayName,
                type: t.type,
                therapeuticArea: t.therapeuticArea,
                affiliation: t.affiliation,
                active: t.active,
              }}
              isScanning={scanningIds.has(t._id)}
              setScanError={setScanError}
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
      )}
    </div>
  );
}
