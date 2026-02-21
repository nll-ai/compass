"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Id } from "@/convex/_generated/dataModel";
import type { Doc } from "@/convex/_generated/dataModel";
import { SourceBadge } from "./SourceBadge";
import type { SourceType } from "@/lib/types";
import { formatSourceDate } from "@/lib/source-utils";

export function SourceLinkOverlay({
  open,
  sourceLink,
  onClose,
}: {
  open: boolean;
  sourceLink: Doc<"rawItems"> | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitItem, setExitItem] = useState<Doc<"rawItems"> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const showing = (open && sourceLink) || (exiting && exitItem);
  const display = (open && sourceLink) ? sourceLink : exitItem;

  useEffect(() => {
    setMounted(typeof document !== "undefined");
  }, []);

  useEffect(() => {
    if (!open && sourceLink && !exiting) {
      setExitItem(sourceLink);
      setExiting(true);
    }
  }, [open, sourceLink, exiting]);
  useEffect(() => {
    if (exiting && !exitItem) setExitItem(null);
  }, [exiting, exitItem]);

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (e.target !== panelRef.current || e.propertyName !== "transform") return;
    if (exiting) {
      setExiting(false);
      setExitItem(null);
    }
  };

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    if (!showing) return;
    const focusTarget = closeRef.current ?? panelRef.current;
    focusTarget?.focus();
  }, [showing]);

  const dateStr = display ? formatSourceDate(display.source, display.publishedAt ?? undefined, display.metadata) : undefined;
  const summary = (display?.abstract ?? "").trim();
  const substantive = (display?.fullText ?? "").trim();
  const hasSubstantive = substantive.length > 0 && substantive !== summary;

  if (!mounted || !showing) return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Source link content"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
        padding: "1rem",
      }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        ref={panelRef}
        onTransitionEnd={handleTransitionEnd}
        style={{
          background: "white",
          borderRadius: 12,
          maxWidth: 640,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
          transform: exiting ? "scale(0.98)" : "scale(1)",
          opacity: exiting ? 0 : 1,
          transition: "transform 0.2s, opacity 0.2s",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
            <div className="stack" style={{ gap: "0.5rem", flex: 1, minWidth: 0 }}>
              <SourceBadge source={display?.source as SourceType} />
              {dateStr && <span className="muted" style={{ fontSize: "0.9rem" }}>{dateStr}</span>}
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{display?.title}</h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                padding: "0.35rem",
                border: "none",
                background: "#f3f4f6",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: "1.25rem",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          {display?.url && (
            <a
              href={display.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.9rem", color: "#2563eb" }}
            >
              Open original ↗
            </a>
          )}
          {summary && (
            <div style={{ marginTop: "1rem" }}>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Summary</h3>
              <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{summary}</p>
            </div>
          )}
          {hasSubstantive && (
            <div style={{ marginTop: "1rem" }}>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Substantive content</h3>
              <div
                className="muted"
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontSize: "0.9rem",
                  maxHeight: 320,
                  overflow: "auto",
                  padding: "0.75rem",
                  background: "#f9fafb",
                  borderRadius: 8,
                }}
              >
                {substantive.slice(0, 8000)}{substantive.length > 8000 ? "…" : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
