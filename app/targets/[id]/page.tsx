"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { DigestItemCard } from "@/components/compass/DigestItemCard";
import { SignalOverlay } from "@/components/compass/SignalOverlay";
import { SourceSelector } from "@/components/compass/SourceSelector";
import type { DigestItem } from "@/lib/types";
import { ALL_SOURCE_IDS, getSourceLabel, type SourceId } from "@/lib/sources/registry";

export default function TargetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as Id<"watchTargets">;
  const target = useQuery(api.watchTargets.get, { id });
  const signals = useQuery(api.digestItems.listByWatchTarget, { watchTargetId: id, limit: 60 });
  const updateTarget = useMutation(api.watchTargets.update);
  const removeTarget = useMutation(api.watchTargets.remove);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [scanningComprehensive, setScanningComprehensive] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(true);
  const [overlayItem, setOverlayItem] = useState<DigestItem | null>(null);
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
        <Link href="/" className="muted" style={{ fontSize: "0.9rem" }}>
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
        <h2 style={{ margin: 0 }}>Signals</h2>
        <p className="muted" style={{ margin: 0 }}>
          Digest signals for this watch target from past scans. Run a scan or comprehensive search to generate new ones.
        </p>
        {signals === undefined ? (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        ) : signals.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No signals yet. Run a scan or comprehensive search above.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", gap: "0.75rem" }}>
            {signals.map((item) => {
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
