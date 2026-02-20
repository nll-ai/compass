"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AddTargetForm } from "@/components/compass/AddTargetForm";

export default function SetupPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const targets = useQuery(api.watchTargets.listActive);
  const [scanTriggered, setScanTriggered] = useState(false);

  const hasTargets = Array.isArray(targets) && targets.length > 0;
  const targetCount = Array.isArray(targets) ? targets.length : 0;

  const handleRunFirstScan = async () => {
    await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period: "daily" }),
    });
    setScanTriggered(true);
  };

  const primaryButton = {
    padding: "0.75rem 1.25rem",
    cursor: "pointer" as const,
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
  };

  return (
    <div className="stack">
      <h1>First-run setup</h1>
      <p className="muted">Get Compass running in a few steps.</p>

      <nav className="card" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {([1, 2, 3] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className="card"
            style={{
              padding: "0.5rem 1rem",
              cursor: "pointer",
              border: step === s ? "2px solid #111827" : "1px solid #e5e7eb",
              fontWeight: step === s ? 600 : 400,
            }}
          >
            Step {s}
          </button>
        ))}
      </nav>

      {step === 1 && (
        <>
          <h2 style={{ margin: 0 }}>Add watch targets</h2>
          <AddTargetForm
            hasTargets={hasTargets}
            targetCount={targetCount}
            showContinueToSlack
            onContinueToSlack={() => setStep(2)}
          />
        </>
      )}

      {step === 2 && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Connect Slack</h2>
          <p className="muted" style={{ margin: 0 }}>
            Configure in <Link href="/settings">Settings</Link> when ready. For now you can skip and run a scan.
          </p>
          <button
            type="button"
            onClick={() => setStep(3)}
            style={{ ...primaryButton, alignSelf: "flex-start" }}
          >
            Continue to first scan →
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Run first scan</h2>
          <p className="muted" style={{ margin: 0 }}>
            We'll create a scan run for {targetCount} target(s). Source scanners will be wired in a later phase; for now this creates the run record.
          </p>
          {!scanTriggered ? (
            <button type="button" onClick={handleRunFirstScan} style={{ ...primaryButton, alignSelf: "flex-start" }}>
              Run first scan
            </button>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Scan run created. <Link href="/">Go to Dashboard</Link> to see status (or run again to create another).
            </p>
          )}
        </section>
      )}
    </div>
  );
}
