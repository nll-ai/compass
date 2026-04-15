"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DigestItem, DigestWorkflowStatus } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { SignificanceBadge } from "./SignificanceBadge";
import { SourceBadge } from "./SourceBadge";
import type { SourceType } from "@/lib/types";
import { useState } from "react";

export function DigestItemCard({
  item,
  onOpenInOverlay,
  onSourceClick,
  teamMembers,
  currentUserId,
  currentUserEmail,
}: {
  item: DigestItem;
  onOpenInOverlay?: () => void;
  onSourceClick?: (url: string) => void;
  /** Same-team members for assignee dropdown; omit when empty (solo workspace). */
  teamMembers?: Array<{ _id: string; email: string }>;
  currentUserId?: string;
  /** Shown as assignee label when not on a team (solo). */
  currentUserEmail?: string;
}) {
  const setFeedback = useMutation(api.digestItems.setFeedback);
  const setWorkflowStatus = useMutation(api.digestItems.setWorkflowStatus);
  const setAssignee = useMutation(api.digestItems.setAssignee);
  const addComment = useMutation(api.digestItems.addComment);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const digestItemId = item._id as Id<"digestItems">;
  const comments = useQuery(
    api.digestItems.listComments,
    commentsOpen ? { digestItemId } : "skip",
  );

  const assigneeOptions: Array<{ _id: string; email: string }> =
    teamMembers && teamMembers.length > 0
      ? teamMembers
      : currentUserId && currentUserEmail
        ? [{ _id: currentUserId, email: currentUserEmail }]
        : [];

  const workflowStatus: DigestWorkflowStatus = item.workflowStatus ?? "open";
  const hasSources = Array.isArray(item.sources) && item.sources.length > 0;
  const isGood = item.feedback === "good";
  const isBad = item.feedback === "bad";

  return (
    <article className="card stack">
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <SignificanceBadge significance={item.significance} />
        <CategoryBadge category={item.category} />
      </div>
      <h3 style={{ margin: 0 }}>{item.headline}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {item.synthesis}
      </p>
      {onOpenInOverlay != null && (
        <button
          type="button"
          onClick={onOpenInOverlay}
          style={{
            alignSelf: "flex-start",
            padding: "0.35rem 0.75rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          View
        </button>
      )}
      {hasSources && (
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            Links to original sources
          </span>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {item.sources.map((s, i) => (
              <li key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                {onSourceClick ? (
                  <button
                    type="button"
                    onClick={() => onSourceClick(s.url)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.9rem",
                      color: "#2563eb",
                      textDecoration: "none",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <SourceBadge source={s.source as SourceType} />
                    <span>{s.title || "View"}</span>
                    <span aria-hidden>↗</span>
                  </button>
                ) : (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.9rem",
                      color: "#2563eb",
                      textDecoration: "none",
                    }}
                  >
                    <SourceBadge source={s.source as SourceType} />
                    <span>{s.title || "View"}</span>
                    <span aria-hidden>↗</span>
                  </a>
                )}
                {s.date != null && s.date !== "" && (
                  <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>{s.date}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        className="stack"
        style={{
          marginTop: "0.75rem",
          gap: "0.5rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid var(--border, #e5e7eb)",
        }}
        aria-label="Signal workflow"
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          <label htmlFor={`wf-status-${item._id}`} className="muted" style={{ fontSize: "0.8rem" }}>
            Status
          </label>
          <select
            id={`wf-status-${item._id}`}
            value={workflowStatus}
            onChange={(e) => {
              void setWorkflowStatus({
                digestItemId,
                workflowStatus: e.target.value as DigestWorkflowStatus,
              });
            }}
            className="card"
            style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", maxWidth: "12rem" }}
            aria-label={`Workflow status for ${item.headline.slice(0, 40)}`}
          >
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
          </select>
          {assigneeOptions.length > 0 && (
            <>
              <label htmlFor={`wf-assign-${item._id}`} className="muted" style={{ fontSize: "0.8rem" }}>
                Assignee
              </label>
              <select
                id={`wf-assign-${item._id}`}
                value={item.assigneeUserId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  void setAssignee({
                    digestItemId,
                    assigneeUserId: v === "" ? null : (v as Id<"users">),
                  });
                }}
                className="card"
                style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", maxWidth: "14rem" }}
                aria-label={`Assignee for ${item.headline.slice(0, 40)}`}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.email}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <button
          type="button"
          className="button-secondary-compact"
          onClick={() => setCommentsOpen((o) => !o)}
          aria-expanded={commentsOpen}
          aria-controls={`comments-${item._id}`}
        >
          {commentsOpen ? "Hide comments" : "Comments"}
        </button>
        {commentsOpen && (
          <div id={`comments-${item._id}`} className="stack" style={{ gap: "0.5rem" }}>
            {comments === undefined ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                Loading comments…
              </p>
            ) : comments.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                No comments yet.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
                {comments.map((c) => (
                  <li key={c._id} style={{ fontSize: "0.85rem" }}>
                    <span className="muted">{c.authorEmail || "User"} · </span>
                    {c.body}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment"
                className="card"
                style={{ flex: "1 1 200px", minWidth: 0, padding: "0.5rem", fontSize: "0.85rem" }}
                aria-label="New comment"
              />
              <button
                type="button"
                className="card"
                disabled={commentBusy || !commentDraft.trim()}
                style={{
                  padding: "0.45rem 0.75rem",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  background: "var(--ink, #111827)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: commentBusy || !commentDraft.trim() ? "not-allowed" : "pointer",
                  opacity: commentBusy || !commentDraft.trim() ? 0.5 : 1,
                }}
                onClick={async () => {
                  const t = commentDraft.trim();
                  if (!t) return;
                  setCommentBusy(true);
                  try {
                    await addComment({ digestItemId, body: t });
                    setCommentDraft("");
                  } finally {
                    setCommentBusy(false);
                  }
                }}
              >
                {commentBusy ? "Sending…" : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span className="muted" style={{ fontSize: "0.8rem" }}>Was this relevant?</span>
        <button
          type="button"
          onClick={() => setFeedback({ digestItemId: item._id as Id<"digestItems">, feedback: "good" })}
          aria-pressed={isGood}
          title="Mark as relevant"
          style={{
            padding: "0.25rem 0.5rem",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: isGood ? "#dcfce7" : "transparent",
            color: isGood ? "#166534" : "#6b7280",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          👍 Yes
        </button>
        <button
          type="button"
          onClick={() => setFeedback({ digestItemId: item._id as Id<"digestItems">, feedback: "bad" })}
          aria-pressed={isBad}
          title="Mark as not relevant"
          style={{
            padding: "0.25rem 0.5rem",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: isBad ? "#fee2e2" : "transparent",
            color: isBad ? "#b91c1c" : "#6b7280",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          👎 No
        </button>
      </div>
    </article>
  );
}
