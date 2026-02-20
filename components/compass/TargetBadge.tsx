import type { TherapeuticArea } from "@/lib/types";

export function TargetBadge({
  label,
  therapeuticArea,
}: {
  label: string;
  therapeuticArea: TherapeuticArea;
}) {
  return (
    <span className="card" style={{ display: "inline-block", padding: "0.25rem 0.5rem", borderRadius: 9999 }}>
      {label} · {therapeuticArea}
    </span>
  );
}
