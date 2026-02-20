"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DigestItem } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { SignificanceBadge } from "./SignificanceBadge";
import { SourceBadge } from "./SourceBadge";
import type { SourceType } from "@/lib/types";

export function DigestItemCard({
  item,
  onOpenInOverlay,
  onSourceClick,
}: {
  item: DigestItem;
  onOpenInOverlay?: () => void;
  onSourceClick?: (url: string) => void;
}) {
  const setFeedback = useMutation(api.digestItems.setFeedback);
  const hasSources = Array.isArray(item.sources) && item.sources.length > 0;
  const isGood = item.feedback === "good";
  const isBad = item.feedback === "bad";

  return (
    <article className="card stack">
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <SignificanceBadge significance={item.significance} />
        <CategoryBadge category={item.category} />
      </div>
      <h3 style={{ margin: 0 }}>{item.headline}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {item.synthesis}
      </p>
      {onOpenInOverlay != null && (
        <button
          type="button"
          onClick={onOpenInOverlay}
          style={{
            alignSelf: "flex-start",
            padding: "0.35rem 0.75rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          View
        </button>
      )}
      {hasSources && (
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            Links to original sources
          </span>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {item.sources.map((s, i) => (
              <li key={i}>
                {onSourceClick ? (
                  <button
                    type="button"
                    onClick={() => onSourceClick(s.url)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.9rem",
                      color: "#2563eb",
                      textDecoration: "none",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <SourceBadge source={s.source as SourceType} />
                    <span>{s.title || "View"}</span>
                    <span aria-hidden>↗</span>
                  </button>
                ) : (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.9rem",
                      color: "#2563eb",
                      textDecoration: "none",
                    }}
                  >
                    <SourceBadge source={s.source as SourceType} />
                    <span>{s.title || "View"}</span>
                    <span aria-hidden>↗</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span className="muted" style={{ fontSize: "0.8rem" }}>Was this relevant?</span>
        <button
          type="button"
          onClick={() => setFeedback({ digestItemId: item._id as Id<"digestItems">, feedback: "good" })}
          aria-pressed={isGood}
          title="Mark as relevant"
          style={{
            padding: "0.25rem 0.5rem",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: isGood ? "#dcfce7" : "transparent",
            color: isGood ? "#166534" : "#6b7280",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          👍 Yes
        </button>
        <button
          type="button"
          onClick={() => setFeedback({ digestItemId: item._id as Id<"digestItems">, feedback: "bad" })}
          aria-pressed={isBad}
          title="Mark as not relevant"
          style={{
            padding: "0.25rem 0.5rem",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: isBad ? "#fee2e2" : "transparent",
            color: isBad ? "#b91c1c" : "#6b7280",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          👎 No
        </button>
      </div>
    </article>
  );
}
