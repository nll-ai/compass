import type { DigestItem } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { SignificanceBadge } from "./SignificanceBadge";
import { SourceBadge } from "./SourceBadge";
import type { SourceType } from "@/lib/types";

export function DigestItemCard({ item }: { item: DigestItem }) {
  const hasSources = Array.isArray(item.sources) && item.sources.length > 0;
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
      {hasSources && (
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            Links to original sources
          </span>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {item.sources.map((s, i) => (
              <li key={i}>
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
