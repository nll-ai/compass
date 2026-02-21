"use client";

import { SOURCE_REGISTRY } from "@/lib/sources/registry";

export function DataSourcesSection() {
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Data sources</h2>
      <p className="muted" style={{ margin: 0 }}>
        Signals are pulled from the following sources when you run a scan.
      </p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        {SOURCE_REGISTRY.map(({ id, label }) => (
          <li key={id}>
            <span
              className="card"
              style={{
                display: "inline-block",
                padding: "0.25rem 0.5rem",
                borderRadius: 9999,
                fontSize: "0.875rem",
              }}
            >
              {label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
