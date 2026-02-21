"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DigestItem } from "@/lib/types";
import { DigestItemCard } from "./DigestItemCard";

export function SignalOverlay({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: DigestItem | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitItem, setExitItem] = useState<DigestItem | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastOpenItemRef = useRef<DigestItem | null>(null);

  const showing = (open && item) || (exiting && exitItem);
  const displayItem = (open && item) ? item : exitItem;

  const rawItemIds = displayItem?.rawItemIds?.length ? (displayItem.rawItemIds as Id<"rawItems">[]) : [];
  const rawItems = useQuery(
    api.rawItems.getByIds,
    showing && rawItemIds.length > 0 ? { ids: rawItemIds } : "skip"
  );

  useEffect(() => {
    setMounted(typeof document !== "undefined");
  }, []);

  if (open && item) lastOpenItemRef.current = item;
  useEffect(() => {
    if (!open && lastOpenItemRef.current && !exiting) {
      setExitItem(lastOpenItemRef.current);
      setExiting(true);
      lastOpenItemRef.current = null;
    }
  }, [open, exiting]);
  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (e.target !== panelRef.current || e.propertyName !== "transform") return;
    if (exiting) {
      setExiting(false);
      setExitItem(null);
    }
  };

  useEffect(() => {
    if (!showing) {
      setSourceUrl(null);
      setFetchedContent(null);
      setFetchError(null);
      setFetchLoading(false);
    }
  }, [showing]);

  useEffect(() => {
    if (!showing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    if (open) closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [showing, open, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSourceClick = (url: string) => {
    setSourceUrl(url);
    setFetchedContent(null);
    setFetchError(null);
    setFetchLoading(false);
  };

  const norm = (u: string) => (u ?? "").replace(/\/$/, "");
  const selectedRawItem =
    rawItems && sourceUrl
      ? rawItems.find((r) => norm(r.url) === norm(sourceUrl) || r.url === sourceUrl)
      : null;
  const hasStoredContent =
    selectedRawItem && (selectedRawItem.abstract ?? selectedRawItem.fullText);

  // When user selects a source and we don't have stored content, fetch the page on-the-fly
  useEffect(() => {
    if (!sourceUrl || hasStoredContent) return;
    setFetchLoading(true);
    setFetchError(null);
    setFetchedContent(null);
    let cancelled = false;
    fetch("/api/fetch-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrl }),
    })
      .then((r) => r.json())
      .then((data: { content?: string; error?: string }) => {
        if (cancelled) return;
        setFetchLoading(false);
        if (data.error) {
          setFetchError(data.error);
          return;
        }
        setFetchedContent(data.content ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchLoading(false);
        setFetchError(err instanceof Error ? err.message : "Failed to load page");
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, hasStoredContent]);

  if (!mounted || !showing || !displayItem) return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Signal detail"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={handleBackdropClick}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          opacity: exiting ? 0 : 1,
          transition: "opacity 0.25s ease-out",
        }}
      />
      <div
        ref={panelRef}
        onTransitionEnd={handleTransitionEnd}
        style={{
          position: "relative",
          width: "min(420px, 90vw)",
          maxWidth: "100%",
          height: "100vh",
          background: "var(--bg, #fff)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          transform: exiting ? "translateX(100%)" : "translateX(0)",
          transition: "transform 0.25s ease-out",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <span className="muted" style={{ fontSize: "0.9rem" }}>Signal</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: "0.35rem 0.5rem",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "1.25rem",
              lineHeight: 1,
              color: "#6b7280",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: "1 1 auto", overflow: "auto", padding: "1rem" }}>
          <DigestItemCard
            item={displayItem}
            onOpenInOverlay={undefined}
            onSourceClick={handleSourceClick}
          />
        </div>
        {sourceUrl != null && (
          <div
            style={{
              flex: "0 0 50%",
              minHeight: 200,
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.5rem 1rem",
                background: "#f9fafb",
                fontSize: "0.85rem",
              }}
            >
              <span className="muted">
                {hasStoredContent ? "Content from original page" : "Source preview"}
              </span>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#2563eb", fontWeight: 600 }}
              >
                Open in new tab ↗
              </a>
            </div>
            {hasStoredContent ? (
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "1rem",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {selectedRawItem?.title && (
                  <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>
                    {selectedRawItem.title}
                  </h3>
                )}
                {(selectedRawItem?.fullText ?? selectedRawItem?.abstract) ?? "No content stored."}
              </div>
            ) : fetchLoading ? (
              <div
                style={{
                  flex: 1,
                  padding: "1rem",
                  fontSize: "0.9rem",
                  color: "#6b7280",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    border: "2px solid #e5e7eb",
                    borderTopColor: "#111827",
                    borderRadius: "50%",
                    animation: "scan-spin 0.7s linear infinite",
                  }}
                  aria-hidden
                />
                <p style={{ margin: 0 }}>Loading page…</p>
              </div>
            ) : fetchError ? (
              <div
                style={{
                  flex: 1,
                  padding: "1rem",
                  fontSize: "0.9rem",
                  color: "#6b7280",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0 }}>{fetchError}</p>
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: 600 }}>
                  Open in new tab ↗
                </a>
              </div>
            ) : fetchedContent ? (
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "1rem",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {fetchedContent}
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  padding: "1rem",
                  fontSize: "0.9rem",
                  color: "#6b7280",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0 }}>No content could be extracted. Try opening in a new tab.</p>
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: 600 }}>
                  Open in new tab ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
