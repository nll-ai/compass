import type { DigestItem } from "@/lib/types";

export function DigestItemRow({ item }: { item: DigestItem }) {
  return (
    <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <span>{item.headline}</span>
      <span className="muted">{item.significance}</span>
    </div>
  );
}
