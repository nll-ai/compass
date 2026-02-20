"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

function formatSchedule(schedule: {
  timezone: string;
  dailyEnabled: boolean;
  dailyHour: number;
  dailyMinute: number;
  weeklyEnabled: boolean;
  weeklyDayOfWeek: number;
  weeklyHour: number;
  weeklyMinute: number;
  weekdaysOnly?: boolean;
  rawDescription?: string;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const parts: string[] = [];
  if (schedule.dailyEnabled) {
    const time = `${schedule.dailyHour}:${pad(schedule.dailyMinute)}`;
    parts.push(schedule.weekdaysOnly ? `Weekdays at ${time}` : `Daily at ${time}`);
  }
  if (schedule.weeklyEnabled) {
    const time = `${schedule.weeklyHour}:${pad(schedule.weeklyMinute)}`;
    parts.push(`${dayNames[schedule.weeklyDayOfWeek]} at ${time}`);
  }
  if (parts.length === 0) return "No automatic scans scheduled.";
  return parts.join(". ") + ` (${schedule.timezone})`;
}

export default function SettingsPage() {
  const schedule = useQuery(api.scanSchedule.get);
  const setSchedule = useMutation(api.scanSchedule.set);
  const targets = useQuery(api.watchTargets.listAll);
  const perTargetSchedules = useQuery(api.scanSchedule.listPerTargetSchedules);
  const setForTarget = useMutation(api.scanSchedule.setForTarget);
  const removeForTarget = useMutation(api.scanSchedule.removeForTarget);

  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetDescription, setTargetDescription] = useState("");
  const [targetTimezone, setTargetTimezone] = useState("UTC");
  const [selectedTargetId, setSelectedTargetId] = useState<Id<"watchTargets"> | "">("");
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  const targetMap = new Map(targets?.map((t) => [t._id, t]) ?? []);

  async function handleSave() {
    const text = description.trim();
    if (!text) {
      setError("Enter a schedule in plain language (e.g. “Every day at 9am” or “Every Monday at 10am”).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/schedule/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text, timezone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse schedule");
      await setSchedule({
        timezone: data.timezone ?? timezone,
        dailyEnabled: data.dailyEnabled ?? false,
        dailyHour: data.dailyHour ?? 9,
        dailyMinute: data.dailyMinute ?? 0,
        weeklyEnabled: data.weeklyEnabled ?? false,
        weeklyDayOfWeek: data.weeklyDayOfWeek ?? 1,
        weeklyHour: data.weeklyHour ?? 9,
        weeklyMinute: data.weeklyMinute ?? 0,
        weekdaysOnly: data.weekdaysOnly,
        rawDescription: data.rawDescription ?? text,
      });
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveForTarget() {
    const text = targetDescription.trim();
    if (!selectedTargetId) {
      setTargetError("Select a watch target.");
      return;
    }
    if (!text) {
      setTargetError("Enter a schedule in plain language.");
      return;
    }
    setTargetError(null);
    setSavingTarget(true);
    try {
      const res = await fetch("/api/schedule/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text, timezone: targetTimezone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse schedule");
      await setForTarget({
        watchTargetId: selectedTargetId,
        timezone: data.timezone ?? targetTimezone,
        dailyEnabled: data.dailyEnabled ?? false,
        dailyHour: data.dailyHour ?? 9,
        dailyMinute: data.dailyMinute ?? 0,
        weeklyEnabled: data.weeklyEnabled ?? false,
        weeklyDayOfWeek: data.weeklyDayOfWeek ?? 1,
        weeklyHour: data.weeklyHour ?? 9,
        weeklyMinute: data.weeklyMinute ?? 0,
        weekdaysOnly: data.weekdaysOnly,
        rawDescription: data.rawDescription ?? text,
      });
      setTargetDescription("");
    } catch (e) {
      setTargetError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSavingTarget(false);
    }
  }

  return (
    <div className="stack">
      <h1>Settings</h1>
      <p className="muted">Slack integration, source config, and scan schedule.</p>

      {/* Global: scan all watch targets */}
      <section className="card stack" style={{ gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Scan all watch targets</h2>
        <p className="muted" style={{ margin: 0 }}>
          When to run a single scan across every active watch target. Checks run every 15 minutes; we trigger when it’s time.
        </p>
        {schedule === undefined ? (
          <p className="muted">Loading…</p>
        ) : schedule === null ? (
          <p className="muted">No global schedule. Add one below.</p>
        ) : (
          <p style={{ margin: 0 }}>
            <strong>Current:</strong> {formatSchedule(schedule)}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 200px", minWidth: 0 }}>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>
              Schedule (e.g. “Every day at 9am”, “Weekdays at 8:30”)
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Every day at 9am"
              className="card"
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </label>
          <label>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>Timezone</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="card"
              style={{ padding: "0.5rem" }}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleSave} disabled={saving} className="card" style={{ padding: "0.5rem 1rem" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error && <p style={{ margin: 0, color: "var(--color-error, #c00)" }}>{error}</p>}
      </section>

      {/* Per-target: scan one watch target on its own schedule */}
      <section className="card stack" style={{ gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Scan per watch target</h2>
        <p className="muted" style={{ margin: 0 }}>
          Run scans for a single watch target on a different schedule (e.g. more often for a high-priority target).
        </p>
        {perTargetSchedules === undefined ? (
          <p className="muted">Loading…</p>
        ) : perTargetSchedules.length === 0 ? (
          <p className="muted">No per-target schedules. Add one below.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {perTargetSchedules.map((row) => {
              const target = targetMap.get(row.watchTargetId);
              const name = target?.displayName ?? target?.name ?? row.watchTargetId;
              return (
                <li key={row._id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Link href={`/targets/${row.watchTargetId}`} className="muted" style={{ minWidth: 0 }}>
                    {name}
                  </Link>
                  <span className="muted">·</span>
                  <span style={{ flex: "1 1 200px", minWidth: 0 }}>{formatSchedule(row)}</span>
                  <button
                    type="button"
                    onClick={() => removeForTarget({ watchTargetId: row.watchTargetId })}
                    className="card muted"
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.9rem" }}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
          <label>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>Watch target</span>
            <select
              value={selectedTargetId}
              onChange={(e) => setSelectedTargetId(e.target.value as Id<"watchTargets"> | "")}
              className="card"
              style={{ padding: "0.5rem", minWidth: "140px" }}
            >
              <option value="">Select…</option>
              {targets?.map((t) => (
                <option key={t._id} value={t._id}>{t.displayName || t.name}</option>
              ))}
            </select>
          </label>
          <label style={{ flex: "1 1 180px", minWidth: 0 }}>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>Schedule</span>
            <input
              type="text"
              value={targetDescription}
              onChange={(e) => setTargetDescription(e.target.value)}
              placeholder="e.g. Every day at 8am"
              className="card"
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </label>
          <label>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>Timezone</span>
            <select
              value={targetTimezone}
              onChange={(e) => setTargetTimezone(e.target.value)}
              className="card"
              style={{ padding: "0.5rem" }}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleSaveForTarget}
            disabled={savingTarget}
            className="card"
            style={{ padding: "0.5rem 1rem" }}
          >
            {savingTarget ? "Saving…" : "Add / update"}
          </button>
        </div>
        {targetError && <p style={{ margin: 0, color: "var(--color-error, #c00)" }}>{targetError}</p>}
      </section>
    </div>
  );
}
