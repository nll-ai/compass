import type { SourceType } from "@/lib/types";
import { sourceLabel } from "@/lib/source-utils";

export function SourceBadge({ source }: { source: SourceType }) {
  return (
    <span className="source-badge" data-source={source}>
      {sourceLabel(source)}
    </span>
  );
}
