"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DigestSummaryCard } from "@/components/compass/DigestSummaryCard";
import { formatDate } from "@/lib/formatters";

export default function DashboardPage() {
  const targets = useQuery(api.watchTargets.listActive);
  const latestDigests = useQuery(api.digestRuns.listRecent, { limit: 1 });
  const recentScans = useQuery(api.scans.listRecent, { limit: 7 });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

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
        {latestDigest && (
          <span>
            <strong>{latestDigest.totalSignals}</strong> <span className="muted">signals in latest digest</span>
          </span>
        )}
        {scans.length > 0 && (
          <span className="muted">
            Last scan: {formatDate(scans[0].scheduledFor)} — {scans[0].status}
          </span>
        )}
        {scanError && (
          <p style={{ color: "#b91c1c", margin: 0, fontSize: "0.9rem" }}>{scanError}</p>
        )}
        <button
          type="button"
          onClick={async () => {
            setScanning(true);
            setScanError(null);
            try {
              const res = await fetch("/api/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period: "daily" }),
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
                  msg = "Convex rejected the scan secret. Set SCAN_SECRET in Convex to match .env.local: run npx convex env set SCAN_SECRET \"your-secret\" (use the same value as in .env.local).";
                }
                setScanError(msg);
                console.error("Scan failed:", res.status, msg, text.slice(0, 200));
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setScanError(msg);
              console.error("Scan request failed:", e);
            } finally {
              setScanning(false);
            }
          }}
          disabled={scanning}
          style={{
            marginLeft: "auto",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "none",
            background: "#111827",
            color: "white",
            fontWeight: 600,
            cursor: scanning ? "wait" : "pointer",
          }}
        >
          {scanning ? "Starting…" : "Run scan now"}
        </button>
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

      <section className="stack">
        <h2 style={{ margin: 0 }}>Recent scans</h2>
        {scans.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>No scans yet.</p>
          </div>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {scans.map((scan) => (
              <li key={scan._id}>
                <Link
                  href="/history"
                  className="card"
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  {formatDate(scan.scheduledFor)} — {scan.status} · {scan.newItemsFound} new
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
