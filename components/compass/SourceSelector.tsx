"use client";

import { SOURCE_REGISTRY, ALL_SOURCE_IDS, type SourceId } from "@/lib/sources/registry";

export function SourceSelector({
  selected,
  onChange,
  disabled,
}: {
  selected: SourceId[];
  onChange: (ids: SourceId[]) => void;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);

  const toggle = (id: SourceId) => {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectAll = () => onChange([...ALL_SOURCE_IDS]);
  const selectNone = () => onChange([]);

  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: "0.875rem" }}>
          Sources to run:
        </span>
        <button
          type="button"
          onClick={selectAll}
          disabled={disabled}
          style={{
            padding: "0.2rem 0.5rem",
            fontSize: "0.8rem",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "transparent",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={selectNone}
          disabled={disabled}
          style={{
            padding: "0.2rem 0.5rem",
            fontSize: "0.8rem",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "transparent",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          None
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {SOURCE_REGISTRY.map(({ id, label }) => (
          <label
            key={id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.25rem 0.5rem",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: selectedSet.has(id) ? 1 : 0.6,
            }}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(id)}
              onChange={() => toggle(id)}
              disabled={disabled}
            />
            <span style={{ fontSize: "0.8125rem" }}>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
