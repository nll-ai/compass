"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DigestSummaryCard } from "@/components/compass/DigestSummaryCard";
import { formatDate } from "@/lib/formatters";

function DashboardTargetRow({
  target,
  isScanning,
  isScanningComprehensive,
  onRunScan,
  onRunComprehensiveScan,
  setScanError,
}: {
  target: { _id: Id<"watchTargets">; displayName: string };
  isScanning: boolean;
  isScanningComprehensive: boolean;
  onRunScan: () => Promise<void>;
  onRunComprehensiveScan: () => Promise<void>;
  setScanError: (msg: string | null) => void;
}) {
  const latestDigest = useQuery(api.digestRuns.getLatestForTarget, { watchTargetId: target._id });
  return (
    <li>
      <div className="stack" style={{ gap: "0.75rem" }}>
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/targets/${target._id}`}
            style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
          >
            {target.displayName}
          </Link>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isScanning}
              onClick={async () => {
                setScanError(null);
                await onRunScan();
              }}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: 8,
                border: "none",
                background: isScanning ? "#6b7280" : "#111827",
                color: "white",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: isScanning ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              {isScanning && (
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "scan-spin 0.7s linear infinite",
                  }}
                  aria-hidden
                />
              )}
              {isScanning ? "Scanning…" : "Run scan"}
            </button>
            <button
              type="button"
              disabled={isScanningComprehensive}
              onClick={async () => {
                setScanError(null);
                await onRunComprehensiveScan();
              }}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: 8,
                border: "1px solid #374151",
                background: isScanningComprehensive ? "#6b7280" : "transparent",
                color: "#374151",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: isScanningComprehensive ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
              title="May take 1–2 minutes"
            >
              {isScanningComprehensive && (
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: "2px solid rgba(55,65,81,0.3)",
                    borderTopColor: "#374151",
                    borderRadius: "50%",
                    animation: "scan-spin 0.7s linear infinite",
                  }}
                  aria-hidden
                />
              )}
              {isScanningComprehensive ? "Running…" : "Run comprehensive search"}
            </button>
          </div>
        </div>
        {latestDigest === undefined ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem", paddingLeft: "0.25rem" }}>
            Loading…
          </p>
        ) : latestDigest ? (
          <div style={{ paddingLeft: "0.5rem", borderLeft: "3px solid #e5e7eb" }}>
            <DigestSummaryCard
              digest={{
                _id: latestDigest._id,
                period: latestDigest.period,
                generatedAt: latestDigest.generatedAt,
                executiveSummary: latestDigest.executiveSummary,
                totalSignals: latestDigest.totalSignals,
                criticalCount: latestDigest.criticalCount,
                highCount: latestDigest.highCount,
                mediumCount: latestDigest.mediumCount,
                lowCount: latestDigest.lowCount,
              }}
            />
            <Link
              href={`/digest/${latestDigest._id}`}
              className="muted"
              style={{ fontSize: "0.85rem" }}
            >
              View full digest →
            </Link>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem", paddingLeft: "0.25rem" }}>
            No digest yet for this target. Run a scan to generate one.
          </p>
        )}
      </div>
    </li>
  );
}

export default function DashboardPage() {
  const targets = useQuery(api.watchTargets.listActive);
  const latestDigests = useQuery(api.digestRuns.listRecent, { limit: 1 });
  const recentScans = useQuery(api.scans.listRecent, { limit: 7 });
  const [scanningIds, setScanningIds] = useState<Set<Id<"watchTargets">>>(new Set());
  const [scanningComprehensiveIds, setScanningComprehensiveIds] = useState<Set<Id<"watchTargets">>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const scanning = scanningIds.size > 0 || scanningComprehensiveIds.size > 0;

  const isLoading = targets === undefined;
  const hasTargets = Array.isArray(targets) && targets.length > 0;
  const latestDigest = Array.isArray(latestDigests) && latestDigests.length > 0 ? latestDigests[0] : null;
  const scans = Array.isArray(recentScans) ? recentScans : [];

  if (isLoading) {
    return (
      <div className="stack">
        <h1>Dashboard</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!hasTargets) {
    return (
      <div className="stack">
        <h1>Dashboard</h1>
        <p className="muted">No watch targets yet. Set up Compass to start monitoring.</p>
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Get started</h2>
          <p className="muted" style={{ margin: 0 }}>
            Add watch targets, connect Slack, and run your first scan. Takes about 10 minutes.
          </p>
          <Link
            href="/setup"
            className="card"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.25rem",
              borderRadius: 8,
              background: "#111827",
              color: "white",
              fontWeight: 600,
            }}
          >
            Get started →
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Dashboard</h1>

      <section className="summary-strip card" style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span>
          <strong>{targets!.length}</strong> <span className="muted">targets</span>
        </span>
        {latestDigest && !scanning && (
          <span>
            <strong>{latestDigest.totalSignals}</strong> <span className="muted">signals in latest digest</span>
          </span>
        )}
        {scanning ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                width: 18,
                height: 18,
                border: "2px solid #e5e7eb",
                borderTopColor: "#111827",
                borderRadius: "50%",
                animation: "scan-spin 0.7s linear infinite",
              }}
              aria-hidden
            />
            <strong>
              Scanning…{(scanningIds.size + scanningComprehensiveIds.size) > 1 ? ` ${scanningIds.size + scanningComprehensiveIds.size} targets` : ""}
            </strong>
            <span className="muted">This may take a minute.</span>
          </span>
        ) : scans.length > 0 ? (
          <span className="muted">
            Last scan: {formatDate(scans[0].scheduledFor)} — {scans[0].status}
          </span>
        ) : null}
        {scanError && !scanning && (
          <p style={{ color: "#b91c1c", margin: 0, fontSize: "0.9rem" }}>{scanError}</p>
        )}
      </section>

      <section className="stack">
        <h2 style={{ margin: 0 }}>Targets we&apos;re monitoring</h2>
        <p className="muted" style={{ margin: 0 }}>
          Run a scan for a single target below, or <Link href="/targets">manage targets</Link>.
        </p>
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {targets!.map((target) => (
            <DashboardTargetRow
              key={target._id}
              target={target}
              isScanning={scanningIds.has(target._id)}
              isScanningComprehensive={scanningComprehensiveIds.has(target._id)}
              setScanError={setScanError}
              onRunScan={async () => {
                setScanningIds((prev) => new Set(prev).add(target._id));
                try {
                  const res = await fetch("/api/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ period: "daily", targetIds: [target._id] }),
                  });
                  const text = await res.text();
                  let errBody: { error?: string };
                  if (text) {
                    try {
                      errBody = JSON.parse(text) as { error?: string };
                    } catch {
                      errBody = { error: text };
                    }
                  } else {
                    errBody = { error: res.statusText };
                  }
                  if (!res.ok) {
                    let msg = errBody.error ?? res.statusText ?? `HTTP ${res.status}`;
                    if (msg.includes("Unauthorized")) {
                      msg =
                        "Convex rejected the scan secret. Set SCAN_SECRET in Convex to match .env.local: run npx convex env set SCAN_SECRET \"your-secret\" (use the same value as in .env.local).";
                    }
                    setScanError(msg);
                    console.error("Scan failed:", res.status, msg, text.slice(0, 200));
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  setScanError(msg);
                  console.error("Scan request failed:", e);
                } finally {
                  setScanningIds((prev) => {
                    const next = new Set(prev);
                    next.delete(target._id);
                    return next;
                  });
                }
              }}
              onRunComprehensiveScan={async () => {
                setScanningComprehensiveIds((prev) => new Set(prev).add(target._id));
                try {
                  const res = await fetch("/api/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      period: "daily",
                      targetIds: [target._id],
                      mode: "comprehensive",
                    }),
                  });
                  const text = await res.text();
                  let errBody: { error?: string };
                  if (text) {
                    try {
                      errBody = JSON.parse(text) as { error?: string };
                    } catch {
                      errBody = { error: text };
                    }
                  } else {
                    errBody = { error: res.statusText };
                  }
                  if (!res.ok) {
                    let msg = errBody.error ?? res.statusText ?? `HTTP ${res.status}`;
                    if (msg.includes("Unauthorized")) {
                      msg =
                        "Convex rejected the scan secret. Set SCAN_SECRET in Convex to match .env.local: run npx convex env set SCAN_SECRET \"your-secret\" (use the same value as in .env.local).";
                    }
                    setScanError(msg);
                    console.error("Comprehensive scan failed:", res.status, msg, text.slice(0, 200));
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  setScanError(msg);
                  console.error("Comprehensive scan request failed:", e);
                } finally {
                  setScanningComprehensiveIds((prev) => {
                    const next = new Set(prev);
                    next.delete(target._id);
                    return next;
                  });
                }
              }}
            />
          ))}
        </ul>
      </section>

      <section className="stack">
        <h2 style={{ margin: 0 }}>Latest digest</h2>
        {latestDigest ? (
          <div className="stack">
            <DigestSummaryCard
              digest={{
                _id: latestDigest._id,
                period: latestDigest.period,
                generatedAt: latestDigest.generatedAt,
                executiveSummary: latestDigest.executiveSummary,
                totalSignals: latestDigest.totalSignals,
                criticalCount: latestDigest.criticalCount,
                highCount: latestDigest.highCount,
                mediumCount: latestDigest.mediumCount,
                lowCount: latestDigest.lowCount,
              }}
            />
            <Link
              href={`/digest/${latestDigest._id}`}
              className="muted"
              style={{ fontSize: "0.9rem" }}
            >
              View full digest →
            </Link>
          </div>
        ) : (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No digest yet. Run your first scan from <Link href="/setup">Setup</Link>.
            </p>
          </div>
        )}
      </section>

    </div>
  );
}
