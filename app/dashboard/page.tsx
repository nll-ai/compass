"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DigestSummaryCard } from "@/components/compass/DigestSummaryCard";
import { DataSourcesSection } from "@/components/compass/DataSourcesSection";
import { SourceSelector } from "@/components/compass/SourceSelector";
import { formatDate } from "@/lib/formatters";
import { ALL_SOURCE_IDS, type SourceId } from "@/lib/sources/registry";

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
            No digest yet for this watch target. Run a scan to generate one.
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
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<SourceId[]>(() => [...ALL_SOURCE_IDS]);
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
            Add watch targets, then run a scan from the dashboard or from a target's page.
          </p>
          <Link
            href="/targets"
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
            Add watch targets →
          </Link>
        </section>
        <DataSourcesSection />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Dashboard</h1>

      <section className="summary-strip card" style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span>
          <strong>{targets!.length}</strong> <span className="muted">watch targets</span>
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
              Scanning…{(scanningIds.size + scanningComprehensiveIds.size) > 1 ? ` ${scanningIds.size + scanningComprehensiveIds.size} watch targets` : ""}
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
        {scanSuccess && !scanning && (
          <p style={{ color: "#059669", margin: 0, fontSize: "0.9rem" }}>{scanSuccess}</p>
        )}
      </section>

      <DataSourcesSection />

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Scan options</h2>
        <p className="muted" style={{ margin: 0 }}>
          Choose which sources to run. Run scan or comprehensive search below will use only the selected sources (useful to test a single source).
        </p>
        <SourceSelector
          selected={selectedSourceIds}
          onChange={setSelectedSourceIds}
          disabled={scanning}
        />
      </section>

      <section className="stack">
        <h2 style={{ margin: 0 }}>Watch targets we&apos;re monitoring</h2>
        <p className="muted" style={{ margin: 0 }}>
          Run a scan for a single watch target below, or <Link href="/targets">manage Watch Targets</Link>.
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
                setScanError(null);
                setScanSuccess(null);
                setScanningIds((prev) => new Set(prev).add(target._id));
                try {
                  const res = await fetch("/api/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      period: "daily",
                      targetIds: [target._id],
                      sources: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
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
                    const msg =
                      data.error ??
                      res.statusText ??
                      `HTTP ${res.status}`;
                    const displayMsg = msg.includes("Unauthorized")
                      ? "Convex rejected the scan secret. Set SCAN_SECRET in Convex to match .env.local: run npx convex env set SCAN_SECRET \"your-secret\" (use the same value as in .env.local)."
                      : msg;
                    setScanError(displayMsg);
                    console.error("Scan failed:", res.status, msg, text.slice(0, 200));
                  } else if (data.ok && typeof data.totalFound === "number") {
                    const n = typeof data.newFound === "number" ? data.newFound : 0;
                    setScanSuccess(
                      n > 0
                        ? `Scan finished. ${data.totalFound} items found, ${n} new. Digest updated.`
                        : `Scan finished. ${data.totalFound} items found.`
                    );
                    setTimeout(() => setScanSuccess(null), 8000);
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
                setScanError(null);
                setScanSuccess(null);
                setScanningComprehensiveIds((prev) => new Set(prev).add(target._id));
                try {
                  const res = await fetch("/api/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      period: "daily",
                      targetIds: [target._id],
                      mode: "comprehensive",
                      sources: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
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
                    const msg =
                      data.error ??
                      res.statusText ??
                      `HTTP ${res.status}`;
                    const displayMsg = msg.includes("Unauthorized")
                      ? "Convex rejected the scan secret. Set SCAN_SECRET in Convex to match .env.local: run npx convex env set SCAN_SECRET \"your-secret\" (use the same value as in .env.local)."
                      : msg;
                    setScanError(displayMsg);
                    console.error("Comprehensive scan failed:", res.status, msg, text.slice(0, 200));
                  } else if (data.ok && typeof data.totalFound === "number") {
                    const n = typeof data.newFound === "number" ? data.newFound : 0;
                    setScanSuccess(
                      n > 0
                        ? `Scan finished. ${data.totalFound} items found, ${n} new. Digest updated.`
                        : `Scan finished. ${data.totalFound} items found.`
                    );
                    setTimeout(() => setScanSuccess(null), 8000);
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
              No digest yet. Run your first scan from the dashboard or <Link href="/targets">Watch Targets</Link>.
            </p>
          </div>
        )}
      </section>

    </div>
  );
}
