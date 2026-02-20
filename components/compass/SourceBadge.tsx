import type { SourceType } from "@/lib/types";
import { sourceLabel } from "@/lib/source-utils";

export function SourceBadge({ source }: { source: SourceType }) {
  return (
    <span className="card" style={{ display: "inline-block", padding: "0.25rem 0.5rem", borderRadius: 9999 }}>
      {sourceLabel(source)}
    </span>
  );
}
