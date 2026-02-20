import type { DigestRun } from "@/lib/types";
import { formatDate } from "@/lib/formatters";

export function DigestSummaryCard({ digest }: { digest: DigestRun }) {
  return (
    <section className="card stack">
      <h3 style={{ margin: 0 }}>{formatDate(digest.generatedAt)}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {digest.totalSignals} signals · {digest.criticalCount} critical
      </p>
    </section>
  );
}
