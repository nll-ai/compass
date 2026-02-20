import { formatCategory } from "@/lib/formatters";
import type { DigestCategory } from "@/lib/types";

export function CategoryBadge({ category }: { category: DigestCategory }) {
  return (
    <span className="card" style={{ display: "inline-block", padding: "0.25rem 0.5rem", borderRadius: 9999 }}>
      {formatCategory(category)}
    </span>
  );
}
