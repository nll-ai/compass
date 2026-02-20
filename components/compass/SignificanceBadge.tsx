import type { Significance } from "@/lib/types";

export function SignificanceBadge({ significance }: { significance: Significance }) {
  return (
    <span className="card" style={{ display: "inline-block", padding: "0.25rem 0.5rem", borderRadius: 9999 }}>
      {significance.toUpperCase()}
    </span>
  );
}
