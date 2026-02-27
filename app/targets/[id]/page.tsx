"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { DigestItemCard } from "@/components/compass/DigestItemCard";
import { SignalOverlay } from "@/components/compass/SignalOverlay";
import { SourceBadge } from "@/components/compass/SourceBadge";
import { SourceLinkOverlay } from "@/components/compass/SourceLinkOverlay";
import { SourceSelector } from "@/components/compass/SourceSelector";
import type { DigestItem } from "@/lib/types";
import { ALL_SOURCE_IDS, getSourceLabel, type SourceId } from "@/lib/sources/registry";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatSourceDate } from "@/lib/source-utils";

export default function TargetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as Id<"watchTargets">;
  const target = useQuery(api.watchTargets.get, { id });
  const sourceLinks = useQuery(api.rawItems.listByWatchTarget, { watchTargetId: id, limit: 80 });
  const signalReports = useQuery(api.digestRuns.listSignalReportsForTarget, { watchTargetId: id, limit: 20 });
  const updateTarget = useMutation(api.watchTargets.update);
  const removeTarget = useMutation(api.watchTargets.remove);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [scanningComprehensive, setScanningComprehensive] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(true);
  const [overlayItem, setOverlayItem] = useState<DigestItem | null>(null);
  const [sourceLinkOverlay, setSourceLinkOverlay] = useState<Doc<"rawItems"> | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<Id<"digestRuns"> | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<SourceId[]>(() => [...ALL_SOURCE_IDS]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [aliasesStr, setAliasesStr] = useState("");
  const [type, setType] = useState<"drug" | "target" | "company">("drug");
  const [therapeuticArea, setTherapeuticArea] = useState<"cardiovascular" | "oncology" | "other">("cardiovascular");
  const [indication, setIndication] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [saved, setSaved] = useState(false);

  const reportItems = useQuery(
    api.digestItems.listByDigestRun,
    expandedReportId ? { digestRunId: expandedReportId } : "skip"
  );
  const sourceLinkFeedbackMap = useQuery(
    api.sourceLinkFeedback.getFeedbackMap,
    sourceLinks?.length ? { rawItemIds: sourceLinks.map((r) => r._id) } : "skip"
  );
  const setSourceLinkFeedback = useMutation(api.sourceLinkFeedback.setFeedback);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setDisplayName(target.displayName);
      setAliasesStr(target.aliases.join(", "));
      setType(target.type);
      setTherapeuticArea(target.therapeuticArea);
      setIndication(target.indication ?? "");
      setCompany(target.company ?? "");
      setNotes(target.notes ?? "");
      setActive(target.active);
    }
  }, [target]);

  if (target === undefined) {
    return (
      <div className="stack">
        <h1>Watch target</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (target === null) {
    return (
      <div className="stack">
        <h1>Watch target not found</h1>
        <p className="muted">This watch target may have been removed.</p>
        <Link href="/targets">← Back to Watch Targets</Link>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const aliases = aliasesStr.split(",").map((s) => s.trim()).filter(Boolean);
    await updateTarget({
      id,
      name: name.trim(),
      displayName: displayName.trim(),
      type,
      therapeuticArea,
      aliases,
      indication: indication.trim() || undefined,
      company: company.trim() || undefined,
      notes: notes.trim() || undefined,
      active,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="stack">
      <SignalOverlay open={!!overlayItem} item={overlayItem} onClose={() => setOverlayItem(null)} />
      <SourceLinkOverlay open={!!sourceLinkOverlay} sourceLink={sourceLinkOverlay} onClose={() => setSourceLinkOverlay(null)} />
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <Link href="/targets">Watch Targets</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        {target.displayName}
      </nav>
      <h1 style={{ margin: 0 }}>{target.displayName}</h1>

      <div className="stack" style={{ gap: "0.75rem" }}>
        <div className="card stack" style={{ padding: "0.75rem 1rem" }}>
          <SourceSelector
            selected={selectedSourceIds}
            onChange={setSelectedSourceIds}
            disabled={scanning || scanningComprehensive}
          />
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            disabled={scanning}
            onClick={async () => {
              setScanning(true);
              setScanMessage(null);
              try {
                const res = await fetch("/api/scan", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    period: "daily",
                    targetIds: [id],
                    sources: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && typeof data.totalFound === "number") {
                  const newCount = typeof data.newFound === "number" ? data.newFound : 0;
                  const failed = data.failedSources as Record<string, string> | undefined;
                  let msg =
                    newCount > 0
                      ? `Scan finished. ${data.totalFound} items found, ${newCount} new. Digest updated.`
                      : `Scan finished. ${data.totalFound} items found, 0 new (no digest).`;
                  if (failed && Object.keys(failed).length > 0) {
                    const parts = Object.entries(failed).map(([src, err]) => `${getSourceLabel(src as SourceId)}: ${err}`);
                    msg += " " + parts.join(" ");
                  }
                  setScanMessage(msg);
                  setTimeout(() => setScanMessage(null), 15000);
                }
              } finally {
                setScanning(false);
              }
            }}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "none",
            background: scanning ? "#6b7280" : "#111827",
            color: "white",
            fontWeight: 600,
            cursor: scanning ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {scanning && (
            <span
              style={{
                width: 14,
                height: 14,
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "white",
                borderRadius: "50%",
                animation: "scan-spin 0.7s linear infinite",
              }}
              aria-hidden
            />
          )}
          {scanning ? "Scanning…" : "Run scan"}
        </button>
        <button
          type="button"
          disabled={scanningComprehensive}
            onClick={async () => {
              setScanningComprehensive(true);
              setScanMessage(null);
              try {
                const res = await fetch("/api/scan", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    period: "daily",
                    targetIds: [id],
                    mode: "comprehensive",
                    sources: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && typeof data.totalFound === "number") {
                  const newCount = typeof data.newFound === "number" ? data.newFound : 0;
                  const failed = data.failedSources as Record<string, string> | undefined;
                  let msg =
                    newCount > 0
                      ? `Scan finished. ${data.totalFound} items found, ${newCount} new. Digest updated.`
                      : `Scan finished. ${data.totalFound} items found, 0 new (no digest).`;
                  if (failed && Object.keys(failed).length > 0) {
                    const parts = Object.entries(failed).map(([src, err]) => `${getSourceLabel(src as SourceId)}: ${err}`);
                    msg += " " + parts.join(" ");
                  }
                  setScanMessage(msg);
                  setTimeout(() => setScanMessage(null), 15000);
                }
              } finally {
                setScanningComprehensive(false);
              }
            }}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "1px solid #374151",
            background: scanningComprehensive ? "#6b7280" : "transparent",
            color: "#374151",
            fontWeight: 600,
            cursor: scanningComprehensive ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
          title="May take 1–2 minutes"
        >
          {scanningComprehensive && (
            <span
              style={{
                width: 14,
                height: 14,
                border: "2px solid rgba(55,65,81,0.3)",
                borderTopColor: "#374151",
                borderRadius: "50%",
                animation: "scan-spin 0.7s linear infinite",
              }}
              aria-hidden
            />
          )}
          {scanningComprehensive ? "Running…" : "Run comprehensive search"}
        </button>
        <Link href="/dashboard" className="muted" style={{ fontSize: "0.9rem" }}>
          View recent scans on Dashboard →
        </Link>
        {scanMessage && (
          <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
            {scanMessage}
          </p>
        )}
        </div>
      </div>

      <section className="card stack">
        <button
          type="button"
          onClick={() => setFormCollapsed((c) => !c)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 600,
            textAlign: "left",
          }}
        >
          Edit Watch Target
          <span aria-hidden style={{ transform: formCollapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}>
            ▾
          </span>
        </button>
        {!formCollapsed && (
      <form onSubmit={handleSave} className="stack" style={{ marginTop: "1rem" }}>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          />
        </label>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          />
        </label>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>Aliases (comma-separated)</span>
          <input
            type="text"
            value={aliasesStr}
            onChange={(e) => setAliasesStr(e.target.value)}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          />
        </label>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "drug" | "target" | "company")}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          >
            <option value="drug">Drug</option>
            <option value="target">Target</option>
            <option value="company">Company</option>
          </select>
        </label>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>Therapeutic area</span>
          <select
            value={therapeuticArea}
            onChange={(e) => setTherapeuticArea(e.target.value as "cardiovascular" | "oncology" | "other")}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          >
            <option value="cardiovascular">Cardiovascular</option>
            <option value="oncology">Oncology</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>Indication</span>
          <input
            type="text"
            value={indication}
            onChange={(e) => setIndication(e.target.value)}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          />
        </label>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>Company</span>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          />
        </label>
        <label>
          <span className="muted" style={{ fontSize: "0.85rem" }}>What are you looking to monitor?</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. trial readouts, discontinuations, pipeline changes, competitor moves"
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          />
          <span className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem", display: "block" }}>
            This guides which signals we surface—only items that help answer this get shown.
          </span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>Active (included in scans)</span>
        </label>
        <button
          type="submit"
          className="card"
          style={{
            padding: "0.75rem 1.25rem",
            cursor: "pointer",
            background: "#111827",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            alignSelf: "flex-start",
          }}
        >
          {saved ? "Saved" : "Save changes"}
        </button>
      </form>
        )}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Insights View</h2>
        <p className="muted" style={{ margin: 0 }}>
          Pre-baked views to explore this target’s source links by focus (e.g. timeline by clinical trials, SEC filings, or news).
        </p>
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", gap: "0.5rem" }}>
          <li>
            <Link
              href={`/targets/${id}/timeline`}
              className="card"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                color: "inherit",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "0.9rem",
              }}
            >
              Timeline →
            </Link>
          </li>
          <li>
            <Link
              href={`/targets/${id}/digests`}
              className="card"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                color: "inherit",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "0.9rem",
              }}
            >
              Digest log →
            </Link>
          </li>
        </ul>
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Source Links</h2>
        <p className="muted" style={{ margin: 0 }}>
          Individual links from each source family (papers, filings, trials, etc.). Each has a summary and substantive content stored 1:1.
        </p>
        {sourceLinks === undefined ? (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        ) : sourceLinks.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No source links yet. Run a scan or comprehensive search above.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", gap: "0.75rem" }}>
            {sourceLinks.map((raw) => {
              const dateStr = formatSourceDate(raw.source, raw.publishedAt ?? undefined, raw.metadata);
              const summary = (raw.abstract ?? "").trim() || raw.title;
              return (
                <li key={raw._id}>
                  <article className="card stack" style={{ padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                      <SourceBadge source={raw.source as import("@/lib/types").SourceType} />
                      {dateStr && <span className="muted" style={{ fontSize: "0.85rem" }}>{dateStr}</span>}
                    </div>
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>{raw.title}</h3>
                    <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                      {summary.slice(0, 200)}{summary.length > 200 ? "…" : ""}
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      <a href={raw.url} target="_blank" rel="noopener noreferrer" className="link" style={{ fontSize: "0.9rem" }}>
                        Open original ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => setSourceLinkOverlay(raw)}
                        style={{
                          fontSize: "0.9rem",
                          padding: "0.25rem 0.5rem",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          background: "transparent",
                          cursor: "pointer",
                          color: "#374151",
                        }}
                      >
                        View substantive content
                      </button>
                      <span className="source-link-feedback" role="group" aria-label="Was this useful?">
                        <button
                          type="button"
                          onClick={() => setSourceLinkFeedback({ rawItemId: raw._id, feedback: "good" })}
                          aria-pressed={sourceLinkFeedbackMap?.[raw._id] === "good"}
                          aria-label="Useful"
                          title="Mark as useful"
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          onClick={() => setSourceLinkFeedback({ rawItemId: raw._id, feedback: "bad" })}
                          aria-pressed={sourceLinkFeedbackMap?.[raw._id] === "bad"}
                          aria-label="Not useful"
                          title="Mark as not useful"
                        >
                          👎
                        </button>
                      </span>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Signal Reports</h2>
        <p className="muted" style={{ margin: 0 }}>
          Reports at a given time that synthesize many source links into signals. Same set of links → same report (hash-deduped).
        </p>
        {signalReports === undefined ? (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        ) : signalReports.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No signal reports yet. Run a scan to generate one.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", gap: "0.5rem" }}>
            {signalReports.map((run) => {
              const isExpanded = expandedReportId === run._id;
              const items = isExpanded && reportItems ? reportItems : [];
              return (
                <li key={run._id}>
                  <div className="card stack" style={{ padding: "0.75rem 1rem" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedReportId(isExpanded ? null : run._id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: 0,
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: "1rem",
                        fontWeight: 600,
                      }}
                    >
                      <span>
                        {new Date(run.generatedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      <span style={{ marginLeft: "0.5rem" }}>{isExpanded ? "▼" : "▶"}</span>
                    </button>
                    <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                      {run.executiveSummary} · {run.totalSignals} signal{run.totalSignals !== 1 ? "s" : ""}
                    </p>
                    {isExpanded && (
                      <ul className="stack" style={{ listStyle: "none", padding: 0, marginTop: "0.75rem", gap: "0.75rem" }}>
                        {items
                          .filter((d) => d.watchTargetId === id)
                          .map((item) => {
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
                            };
                            return (
                              <li key={item._id}>
                                <DigestItemCard
                                  item={digestItem}
                                  onOpenInOverlay={() => setOverlayItem(digestItem)}
                                />
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card stack" style={{ borderColor: "var(--color-error, #b91c1c)", borderWidth: 1 }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Delete watch target</h2>
        <p className="muted" style={{ margin: 0 }}>
          Permanently delete this watch target and all associated signals, raw items, and per-target scan schedule. This cannot be undone.
        </p>
        <label style={{ marginTop: "0.5rem" }}>
          <span className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>
            Type <strong>{target.displayName}</strong> below to confirm
          </span>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={target.displayName}
            className="card"
            style={{
              width: "100%",
              maxWidth: 320,
              padding: "0.5rem",
              borderColor: deleteConfirmText && deleteConfirmText !== target.displayName ? "var(--color-error, #b91c1c)" : undefined,
            }}
            aria-label="Type watch target name to confirm deletion"
          />
        </label>
        <button
          type="button"
          disabled={deleting || deleteConfirmText !== target.displayName}
          onClick={async () => {
            setDeleting(true);
            try {
              await removeTarget({ id });
              router.push("/targets");
            } finally {
              setDeleting(false);
            }
          }}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "1px solid var(--color-error, #b91c1c)",
            background: deleting || deleteConfirmText !== target.displayName ? "#9ca3af" : "var(--color-error, #b91c1c)",
            color: "white",
            fontWeight: 600,
            cursor: deleting || deleteConfirmText !== target.displayName ? "not-allowed" : "pointer",
            alignSelf: "flex-start",
          }}
        >
          {deleting ? "Deleting…" : "Delete watch target"}
        </button>
      </section>
    </div>
  );
}
