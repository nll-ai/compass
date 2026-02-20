import type { WatchTarget } from "@/lib/types";

export function WatchTargetCard({ target }: { target: WatchTarget }) {
  return (
    <article className="card stack">
      <h3 style={{ margin: 0 }}>{target.displayName}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {target.therapeuticArea} · {target.type}
      </p>
    </article>
  );
}
