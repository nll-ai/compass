"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { TargetLookupResult } from "@/lib/types";

const primaryButton = {
  padding: "0.75rem 1.25rem",
  cursor: "pointer" as const,
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 600,
};

type Props = {
  onAdded?: () => void;
  showContinueToSlack?: boolean;
  onContinueToSlack?: () => void;
  hasTargets?: boolean;
  targetCount?: number;
};

export function AddTargetForm({
  onAdded,
  showContinueToSlack = false,
  onContinueToSlack,
  hasTargets = false,
  targetCount = 0,
}: Props) {
  const createTarget = useMutation(api.watchTargets.create);
  const [trackQuery, setTrackQuery] = useState("");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [filled, setFilled] = useState<TargetLookupResult | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [aliasesStr, setAliasesStr] = useState("");
  const [type, setType] = useState<"drug" | "target" | "company">("drug");
  const [therapeuticArea, setTherapeuticArea] = useState<"cardiovascular" | "oncology" | "other">("cardiovascular");
  const [indication, setIndication] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = trackQuery.trim();
    if (!q) return;
    setLookupStatus("loading");
    setLookupError(null);
    try {
      const res = await fetch("/api/targets/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? "Lookup failed");
        setLookupStatus("error");
        return;
      }
      const result = data as TargetLookupResult;
      setFilled(result);
      setName(result.name);
      setDisplayName(result.displayName);
      setAliasesStr(result.aliases.join(", "));
      setType(result.type);
      setTherapeuticArea(result.therapeuticArea);
      setIndication(result.indication ?? "");
      setCompany(result.company ?? "");
      setLookupStatus("done");
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Request failed");
      setLookupStatus("error");
    }
  };

  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    const aliases = aliasesStr.split(",").map((s) => s.trim()).filter(Boolean);
    await createTarget({
      name: name.trim() || displayName.trim(),
      displayName: displayName.trim() || name.trim(),
      type,
      therapeuticArea,
      aliases,
      indication: indication.trim() || undefined,
      company: company.trim() || undefined,
      notes: notes.trim() || undefined,
      active: true,
    });
    setTrackQuery("");
    setFilled(null);
    setLookupStatus("idle");
    setName("");
    setDisplayName("");
    setAliasesStr("");
    setIndication("");
    setCompany("");
    setNotes("");
    onAdded?.();
  };

  const handleLookupAnother = () => {
    setTrackQuery("");
    setFilled(null);
    setLookupStatus("idle");
    setLookupError(null);
    setName("");
    setDisplayName("");
    setAliasesStr("");
    setIndication("");
    setCompany("");
    setNotes("");
  };

  return (
    <section className="card stack">
      {!filled ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Tell us what you want to track — a program name, asset, watch target, or a description. We'll look it up and fill the details for you.
          </p>
          <form onSubmit={handleLookup} className="stack">
            <label>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                What do you want to track?
              </span>
              <input
                type="text"
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                placeholder="e.g. Regeneron's cardiovascular NPR1 agonist, REGN5381, B7-H3, or an asset name"
                disabled={lookupStatus === "loading"}
                className="card"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.75rem 1rem",
                  fontSize: "1rem",
                }}
              />
            </label>
            <button type="submit" disabled={lookupStatus === "loading"} style={primaryButton}>
              {lookupStatus === "loading" ? "Looking up…" : "Look up & fill"}
            </button>
          </form>
          {lookupStatus === "error" && lookupError && (
            <p style={{ margin: 0, color: "#b91c1c" }}>{lookupError}</p>
          )}
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Review and edit the details below, then click Add Watch Target. All fields were filled from a web search.
          </p>
          <form onSubmit={handleAddTarget} className="stack">
            <label>
              <span className="muted" style={{ fontSize: "0.85rem" }}>Name (search term)</span>
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
              <span className="muted" style={{ fontSize: "0.85rem" }}>Indication (optional)</span>
              <input
                type="text"
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                className="card"
                style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
              />
            </label>
            <label>
              <span className="muted" style={{ fontSize: "0.85rem" }}>Company (optional)</span>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="card"
                style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
              />
            </label>
            <label>
              <span className="muted" style={{ fontSize: "0.85rem" }}>What are you looking to monitor? (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. trial readouts, discontinuations, pipeline changes"
                className="card"
                style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" }}
              />
            </label>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="submit" style={primaryButton}>
                Add Watch Target
              </button>
              <button
                type="button"
                onClick={handleLookupAnother}
                className="card muted"
                style={{ padding: "0.75rem 1.25rem", cursor: "pointer" }}
              >
                Look up another
              </button>
            </div>
          </form>
        </>
      )}

      {hasTargets && showContinueToSlack && (
        <p className="muted" style={{ margin: 0 }}>
          {targetCount} watch target(s) added. Add more above or continue to Step 2.
        </p>
      )}
      {showContinueToSlack && onContinueToSlack && (
        <button
          type="button"
          onClick={onContinueToSlack}
          disabled={!hasTargets}
          className="card muted"
          style={{
            padding: "0.5rem 1rem",
            cursor: hasTargets ? "pointer" : "not-allowed",
            alignSelf: "flex-start",
          }}
        >
          Continue to Slack →
        </button>
      )}
    </section>
  );
}
