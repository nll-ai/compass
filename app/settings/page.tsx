"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { formatSchedule, COMMON_TIMEZONES } from "@/lib/formatSchedule";

export default function SettingsPage() {
  const userSchedule = useQuery(api.userDigestSchedule.get);
  const setUserSchedule = useMutation(api.userDigestSchedule.set);
  const removeUserSchedule = useMutation(api.userDigestSchedule.remove);

  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="stack" aria-label="Settings">
      <h1>Settings</h1>
      <p className="muted">Digest schedule, Slack integration, and source config.</p>

      <section className="card stack" aria-labelledby="digest-schedule-heading">
        <h2 id="digest-schedule-heading" style={{ margin: 0, fontSize: "1.1rem" }}>
          Digest schedule
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          One combined daily or weekly scan of your subscribed watch targets and a single digest email (like a newsletter).
          Per-target schedules on each target page still run separately if you set them.
        </p>
        {userSchedule === undefined ? (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        ) : userSchedule === null ? (
          <p className="muted" style={{ margin: 0 }}>No global schedule set.</p>
        ) : (
          <p style={{ margin: 0 }}>
            <strong>Current:</strong> {formatSchedule(userSchedule)}
            <button
              type="button"
              onClick={() => removeUserSchedule()}
              className="card muted"
              style={{ marginLeft: "0.5rem", padding: "0.25rem 0.5rem", fontSize: "0.9rem" }}
            >
              Remove
            </button>
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const text = description.trim();
            if (!text) {
              setError("Enter a schedule in plain language (e.g. “Every day at 7am”).");
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
              await setUserSchedule({
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
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setSaving(false);
            }
          }}
          className="stack"
          style={{ gap: "0.75rem", marginTop: "0.5rem" }}
        >
          <label style={{ display: "block" }}>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
              Schedule (e.g. “Every day at 7am”, “Weekdays at 8:30”)
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Every day at 7am"
              className="card"
              style={{ width: "100%", maxWidth: 420, padding: "0.5rem" }}
              aria-label="Natural language digest schedule"
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="muted" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
              Timezone
            </span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="card"
              style={{ padding: "0.5rem", maxWidth: 320 }}
              aria-label="Timezone for digest schedule"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="card"
            style={{
              alignSelf: "flex-start",
              padding: "0.5rem 1rem",
              cursor: saving ? "not-allowed" : "pointer",
              background: "var(--ink, #111827)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
        {error && (
          <p style={{ margin: 0, color: "var(--error, #b91c1c)", fontSize: "0.9rem" }} role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
