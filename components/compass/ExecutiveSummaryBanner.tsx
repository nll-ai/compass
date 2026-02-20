export function ExecutiveSummaryBanner({ summary }: { summary: string }) {
  return (
    <section className="card">
      <strong>Executive Summary</strong>
      <p style={{ marginBottom: 0 }}>{summary}</p>
    </section>
  );
}
