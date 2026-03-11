"use client";

interface ScanButtonProps {
  onScan: () => Promise<void>;
  isScanning: boolean;
  disabled?: boolean;
  size?: "default" | "compact";
}

export function ScanButton({
  onScan,
  isScanning,
  disabled = false,
  size = "default",
}: ScanButtonProps) {
  const padding = size === "compact" ? "0.4rem 0.75rem" : "0.5rem 1rem";
  const fontSize = size === "compact" ? "0.9rem" : undefined;
  const spinnerSize = size === "compact" ? 12 : 14;

  return (
    <button
      type="button"
      disabled={disabled || isScanning}
      onClick={onScan}
      style={{
        padding,
        borderRadius: 8,
        border: "none",
        background: disabled || isScanning ? "#6b7280" : "#111827",
        color: "white",
        fontWeight: 600,
        fontSize,
        cursor: disabled || isScanning ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      {isScanning && (
        <span
          style={{
            width: spinnerSize,
            height: spinnerSize,
            border: "2px solid rgba(255,255,255,0.3)",
            borderTopColor: "white",
            borderRadius: "50%",
            animation: "scan-spin 0.7s linear infinite",
          }}
          aria-hidden
        />
      )}
      {isScanning ? "Scanning…" : "Run scan"}
    </button>
  );
}
