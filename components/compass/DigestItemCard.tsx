import type { DigestItem } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { SignificanceBadge } from "./SignificanceBadge";

export function DigestItemCard({ item }: { item: DigestItem }) {
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
    </article>
  );
}
