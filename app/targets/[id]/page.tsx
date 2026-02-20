"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect } from "react";

export default function TargetDetailPage() {
  const params = useParams();
  const id = params.id as Id<"watchTargets">;
  const target = useQuery(api.watchTargets.get, { id });
  const updateTarget = useMutation(api.watchTargets.update);
  const [scanning, setScanning] = useState(false);

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
        <h1>Target</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (target === null) {
    return (
      <div className="stack">
        <h1>Target not found</h1>
        <p className="muted">This target may have been removed.</p>
        <Link href="/targets">← Back to targets</Link>
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
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <Link href="/targets">Targets</Link>
        <span style={{ margin: "0 0.5rem" }}>/</span>
        {target.displayName}
      </nav>
      <h1 style={{ margin: 0 }}>{target.displayName}</h1>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          disabled={scanning}
          onClick={async () => {
            setScanning(true);
            try {
              await fetch("/api/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period: "daily", targetIds: [id] }),
              });
            } finally {
              setScanning(false);
            }
          }}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "none",
            background: "#111827",
            color: "white",
            fontWeight: 600,
            cursor: scanning ? "wait" : "pointer",
          }}
        >
          {scanning ? "Starting scan…" : "Run scan for this target"}
        </button>
        <Link href="/" className="muted" style={{ fontSize: "0.9rem" }}>
          View recent scans on Dashboard →
        </Link>
      </div>

      <form onSubmit={handleSave} className="card stack">
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
          <span className="muted" style={{ fontSize: "0.85rem" }}>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="card"
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
          />
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

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Signal history</h2>
        <p className="muted" style={{ margin: 0 }}>
          Digest items for this target will appear here once scans and digest generation are wired.
        </p>
      </section>
    </div>
  );
}
