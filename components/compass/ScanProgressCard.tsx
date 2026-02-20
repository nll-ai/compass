export type SourceProgress = {
  source: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  itemsFound: number;
};

export function ScanProgressCard({ statuses }: { statuses: SourceProgress[] }) {
  return (
    <section className="card stack">
      <h3 style={{ margin: 0 }}>Scan Progress</h3>
      {statuses.map((status) => (
        <div key={status.source} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{status.source}</span>
          <span className="muted">
            {status.status} ({status.itemsFound})
          </span>
        </div>
      ))}
    </section>
  );
}
