"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isDecisionBriefEnabledByDefault } from "../lib/digestDecisionPreference";
import {
  planDigestEmailForRecipient,
  type DigestEmailHtmlArgs,
  type DigestEmailRenderableItem,
} from "../lib/digestEmailAssembly";
import { clampDigestEmailLookbackDays } from "../lib/scan/lookback";

export type { DigestEmailHtmlArgs, DigestEmailRenderableItem } from "../lib/digestEmailAssembly";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCategory(category: string): string {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function confidenceLabel(confidence: string): string {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    default:
      return confidence;
  }
}

/** Safe attribute value for `href` (validates http/https, escapes for HTML). */
function hrefAttrFromBase(base: string, path: string): string {
  const b = base.replace(/\/$/, "") || "http://localhost";
  const p = path.startsWith("/") ? path : `/${path}`;
  try {
    const u = new URL(p, `${b}/`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return escapeHtml("#");
    return escapeHtml(u.href);
  } catch {
    return escapeHtml("#");
  }
}

/** Safe absolute URL for source links (validates http/https, escapes for HTML). */
function hrefAttrFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return escapeHtml("#");
    return escapeHtml(parsed.href);
  } catch {
    return escapeHtml("#");
  }
}

export function buildDigestEmailHtml(args: DigestEmailHtmlArgs): string {
  const {
    appUrl,
    period,
    dateStr,
    executiveSummary,
    showExecutiveSummary,
    deltaSummary,
    materialitySummary,
    strategicReadSummary,
    recommendedActionsSummary,
    confidence,
    includeDecisionBrief,
    emailLookbackDays,
    recipientTargetIds,
    items,
    targetDisplayNameById,
  } = args;
  const hubHref = hrefAttrFromBase(appUrl, "/targets");
  const itemsByTarget = new Map<string, DigestEmailRenderableItem[]>();
  for (const item of items) {
    const list = itemsByTarget.get(item.watchTargetId) ?? [];
    list.push(item);
    itemsByTarget.set(item.watchTargetId, list);
  }
  const sortedTargetIds = [...recipientTargetIds].sort((a, b) => {
    const na = targetDisplayNameById.get(a) ?? "";
    const nb = targetDisplayNameById.get(b) ?? "";
    return na.localeCompare(nb);
  });

  let bodyHtml = `<div style="margin:0;padding:16px;background:#f9fafb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;">`;
  bodyHtml += `<div style="max-width:760px;margin:0 auto;">`;
  bodyHtml += `<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;font-weight:700;">Compass ${escapeHtml(period)} digest — ${escapeHtml(dateStr)}</h1>`;
  if (showExecutiveSummary) {
    bodyHtml += `<section style="margin:0 0 16px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#ffffff;">`;
    bodyHtml += `<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(executiveSummary)}</p>`;
    bodyHtml += `</section>`;
  }

  const hasDecisionBrief =
    (deltaSummary?.trim() ?? "") !== "" ||
    (materialitySummary?.trim() ?? "") !== "" ||
    (recommendedActionsSummary?.trim() ?? "") !== "" ||
    (strategicReadSummary?.trim() ?? "") !== "" ||
    confidence != null;
  if (showExecutiveSummary && includeDecisionBrief && hasDecisionBrief && items.length > 0) {
    bodyHtml += `<section style="margin:0 0 16px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#ffffff;">`;
    bodyHtml += `<h2 style="margin:0 0 10px;font-weight:600;font-size:16px;line-height:1.4;">Decision brief</h2>`;
    if (confidence != null) {
      const confidenceBg =
        confidence === "high"
          ? "#d1fae5"
          : confidence === "medium"
            ? "#f3f4f6"
            : "#fee2e2";
      const confidenceColor =
        confidence === "high"
          ? "#059669"
          : confidence === "medium"
            ? "#374151"
            : "#b91c1c";
      bodyHtml += `<p style="margin:0 0 10px;">`;
      bodyHtml += `<span style="display:inline-block;padding:4px 8px;border-radius:6px;background:${confidenceBg};color:${confidenceColor};font-size:12px;font-weight:600;">${escapeHtml(confidenceLabel(confidence))}</span>`;
      bodyHtml += `</p>`;
    }
    if (deltaSummary?.trim()) {
      bodyHtml += `<h3 style="margin:0 0 4px;font-size:14px;line-height:1.4;">What changed</h3>`;
      bodyHtml += `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(deltaSummary)}</p>`;
    }
    if (materialitySummary?.trim()) {
      bodyHtml += `<h3 style="margin:0 0 4px;font-size:14px;line-height:1.4;">Why it matters</h3>`;
      bodyHtml += `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(materialitySummary)}</p>`;
    }
    if (strategicReadSummary?.trim()) {
      bodyHtml += `<h3 style="margin:0 0 4px;font-size:14px;line-height:1.4;">Strategic read</h3>`;
      bodyHtml += `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${escapeHtml(strategicReadSummary)}</p>`;
    }
    if (recommendedActionsSummary?.trim()) {
      bodyHtml += `<h3 style="margin:0 0 4px;font-size:14px;line-height:1.4;">Suggested next steps</h3>`;
      bodyHtml += `<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${escapeHtml(recommendedActionsSummary)}</p>`;
    }
    bodyHtml += `</section>`;
  }

  bodyHtml += `<section style="margin:0 0 16px;">`;
  bodyHtml += `<h2 style="margin:0;font-size:18px;line-height:1.4;">Signals in the last ${escapeHtml(String(emailLookbackDays))} days (${items.length})</h2>`;
  bodyHtml += `<p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">Based on publication or ingestion time of linked sources (not scan lookback alone).</p>`;
  bodyHtml += `</section>`;

  for (const tid of sortedTargetIds) {
    const name = targetDisplayNameById.get(tid) ?? "Watch target";
    const digestHref = hrefAttrFromBase(appUrl, `/targets/${tid}/digests`);
    bodyHtml += `<section style="margin:0 0 16px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#ffffff;">`;
    bodyHtml += `<h2 style="font-size:18px;line-height:1.4;margin:0 0 8px;">${escapeHtml(name)}</h2>`;
    bodyHtml += `<p style="margin:0 0 12px;font-size:14px;"><a href="${digestHref}" style="color:#2563eb;text-decoration:none;">View full digest for ${escapeHtml(name)}</a></p>`;
    const targetItems = itemsByTarget.get(tid) ?? [];
    if (targetItems.length === 0) {
      bodyHtml += `<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">Nothing new was found within the last ${escapeHtml(String(emailLookbackDays))} days for this watch target.</p>`;
      bodyHtml += `</section>`;
      continue;
    }
    bodyHtml += "<ul style=\"margin:0;list-style:none;padding:0;\">";
    for (const it of targetItems) {
      bodyHtml += `<li style="margin:0 0 10px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff;">`;
      bodyHtml += `<div style="margin:0 0 8px;">`;
      bodyHtml += `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 8px;border:1px solid #d1d5db;border-radius:999px;font-size:12px;font-weight:600;color:#374151;">${escapeHtml(it.significance.toUpperCase())}</span>`;
      bodyHtml += `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 8px;border:1px solid #d1d5db;border-radius:999px;font-size:12px;color:#374151;">${escapeHtml(formatCategory(it.category))}</span>`;
      bodyHtml += `</div>`;
      bodyHtml += `<h3 style="margin:0 0 8px;font-size:16px;line-height:1.45;font-weight:600;">${escapeHtml(it.headline)}</h3>`;
      const synthesis = (it.synthesis ?? "").trim();
      bodyHtml += `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(synthesis || "No additional summary available.")}</p>`;
      if (Array.isArray(it.sources) && it.sources.length > 0) {
        bodyHtml += `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6b7280;">Links to original sources</p>`;
        bodyHtml += `<ul style="margin:0;list-style:none;padding:0;">`;
        for (const src of it.sources) {
          const sourceHref = hrefAttrFromUrl(src.url);
          const sourceTitle = (src.title ?? "").trim() || "View";
          const sourceLabel = (src.source ?? "").trim().toUpperCase();
          bodyHtml += `<li style="margin:0 0 4px;font-size:13px;line-height:1.5;">`;
          if (sourceLabel) {
            bodyHtml += `<span style="display:inline-block;margin-right:6px;padding:2px 7px;border:1px solid #d1d5db;border-radius:999px;font-size:11px;color:#374151;">${escapeHtml(sourceLabel)}</span>`;
          }
          bodyHtml += `<a href="${sourceHref}" style="color:#2563eb;text-decoration:none;">${escapeHtml(sourceTitle)} ↗</a>`;
          if (src.date != null && src.date !== "") {
            bodyHtml += ` <span style="font-size:12px;color:#9ca3af;">${escapeHtml(src.date)}</span>`;
          }
          bodyHtml += `</li>`;
        }
        bodyHtml += `</ul>`;
      }
      bodyHtml += "</li>";
    }
    bodyHtml += "</ul>";
    bodyHtml += `</section>`;
  }

  if (sortedTargetIds.length === 0) {
    bodyHtml += `<section style="margin:0 0 16px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#ffffff;">`;
    bodyHtml += `<p style="margin:0;color:#6b7280;font-size:14px;">No watch targets in this digest run for you. <a href="${hubHref}" style="color:#2563eb;text-decoration:none;">Open Watch Targets</a></p>`;
    bodyHtml += `</section>`;
  }
  bodyHtml += `<p style="margin:20px 0 0;font-size:14px;"><a href="${hubHref}" style="color:#2563eb;text-decoration:none;">Open Compass — Watch Targets</a></p>`;
  bodyHtml += `</div>`;
  bodyHtml += `</div>`;
  return bodyHtml;
}

export const sendDigestEmail = internalAction({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, { digestRunId }) => {
    console.log("sendDigestEmail: started", { digestRunId });
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log("sendDigestEmail: RESEND_API_KEY not set, skipping");
      return;
    }

    const digestRun = await ctx.runQuery(internal.digestRuns.getById, { id: digestRunId });
    if (!digestRun) {
      console.log("sendDigestEmail: digest run not found, skipping");
      return;
    }

    const scanRun = await ctx.runQuery(internal.scans.getScanRun, { id: digestRun.scanRunId });
    if (!scanRun?.targetIds?.length) {
      console.log("sendDigestEmail: no scan run or targetIds, skipping");
      return;
    }

    const allItems = await ctx.runQuery(internal.digestItems.listByDigestRunInternal, {
      digestRunId,
    });

    const targets = await ctx.runQuery(internal.watchTargets.getByIdsInternal, {
      ids: scanRun.targetIds,
    });
    const targetById = new Map(targets.map((t) => [t._id, t]));

    const digestItemsForPlan = allItems.map((item) => ({
      watchTargetId: String(item.watchTargetId),
      rawItemIds: item.rawItemIds.map((id) => String(id)),
      significance: item.significance,
      category: item.category,
      headline: item.headline,
      synthesis: item.synthesis,
      sources: item.sources,
    }));

    const allRawIds = [...new Set(allItems.flatMap((item) => item.rawItemIds))];
    const rawRows =
      allRawIds.length > 0
        ? await ctx.runQuery(internal.rawItems.getByIdsInternal, { ids: allRawIds })
        : [];
    const rawByIdGlobal = new Map(rawRows.map((r) => [String(r._id), r]));

    const targetDisplayNameById = new Map(
      [...targetById.entries()].map(([id, target]) => [String(id), target?.displayName ?? ""]),
    );

    const digestRunForPlan = {
      generatedAt: digestRun.generatedAt,
      period: digestRun.period,
      executiveSummary: digestRun.executiveSummary,
      deltaSummary: digestRun.deltaSummary,
      materialitySummary: digestRun.materialitySummary,
      strategicReadSummary: digestRun.strategicReadSummary,
      recommendedActionsSummary: digestRun.recommendedActionsSummary,
      confidence: digestRun.confidence,
    };

    const scanTargetIdStrs = scanRun.targetIds.map(String);

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Compass <notifications@compass.example.com>";
    const dateStr = new Date(digestRun.generatedAt).toLocaleDateString("en-US", {
      dateStyle: "medium",
    });

    type Recipient = {
      userId: Id<"users">;
      email: string;
      decisionBriefPreference?: "inherit" | "enabled" | "disabled";
      digestEmailLookbackDays: number;
    };
    let recipients: Recipient[] = [];

    if (scanRun.digestNotifyUserIds && scanRun.digestNotifyUserIds.length > 0) {
      const uniqueIds = [...new Set(scanRun.digestNotifyUserIds)];
      for (const uid of uniqueIds) {
        const user = await ctx.runQuery(internal.users.getUserById, { id: uid });
        if (user?.email) {
          recipients.push({
            userId: uid,
            email: user.email,
            decisionBriefPreference:
              user.decisionBriefPreference === "enabled" ||
              user.decisionBriefPreference === "disabled" ||
              user.decisionBriefPreference === "inherit"
                ? user.decisionBriefPreference
                : undefined,
            digestEmailLookbackDays: clampDigestEmailLookbackDays(user.digestEmailLookbackDays),
          });
        }
      }
    } else {
      const first = targets[0];
      if (first?.userId) {
        const user = await ctx.runQuery(internal.users.getUserById, { id: first.userId });
        if (user?.email) {
          recipients.push({
            userId: first.userId,
            email: user.email,
            decisionBriefPreference:
              user.decisionBriefPreference === "enabled" ||
              user.decisionBriefPreference === "disabled" ||
              user.decisionBriefPreference === "inherit"
                ? user.decisionBriefPreference
                : undefined,
            digestEmailLookbackDays: clampDigestEmailLookbackDays(user.digestEmailLookbackDays),
          });
        }
      }
    }

    if (recipients.length === 0) {
      console.log("sendDigestEmail: no recipients, skipping");
      return;
    }

    const systemDecisionBriefDefault = isDecisionBriefEnabledByDefault(
      process.env.DECISION_DIGEST_ENABLED,
    );
    for (const { userId, email, decisionBriefPreference, digestEmailLookbackDays } of recipients) {
      const subIds = await ctx.runQuery(
        internal.targetSubscriptions.getSubscribedWatchTargetIdsForUserInternal,
        { userId },
      );

      const { subject, htmlArgs } = planDigestEmailForRecipient({
        digestRun: digestRunForPlan,
        scanRunTargetIds: scanTargetIdStrs,
        allDigestItems: digestItemsForPlan,
        targetDisplayNameById,
        subscribedWatchTargetIds: subIds === null ? null : subIds.map(String),
        rawById: rawByIdGlobal,
        digestEmailLookbackDays,
        decisionBriefPreference,
        systemDecisionBriefDefault,
        appUrl,
        dateStr,
      });

      const bodyHtml = buildDigestEmailHtml(htmlArgs);

      console.log("sendDigestEmail: sending", { to: email, subject });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject,
          html: bodyHtml,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("sendDigestEmail: Resend API error", res.status, errBody);
        throw new Error(`sendDigestEmail: Resend failed ${res.status}: ${errBody}`);
      }
      console.log("sendDigestEmail: sent successfully", { to: email });
    }
  },
});

export const sendTeamInviteEmail = internalAction({
  args: { inviteId: v.id("teamEmailInvites") },
  handler: async (ctx, { inviteId }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log("sendTeamInviteEmail: RESEND_API_KEY not set, skipping");
      return;
    }
    const payload = await ctx.runQuery(internal.teams.getTeamEmailInviteEmailContextInternal, {
      inviteId,
    });
    if (!payload) {
      console.log("sendTeamInviteEmail: no payload (revoked/expired/missing), skipping", { inviteId });
      return;
    }
    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Compass <notifications@compass.example.com>";
    const acceptPath = `/settings?teamInvite=${encodeURIComponent(payload.token)}`;
    const acceptHref = hrefAttrFromBase(appUrl, acceptPath);
    let readableAcceptUrl = "";
    try {
      const u = new URL(acceptPath.startsWith("/") ? acceptPath : `/${acceptPath}`, `${appUrl}/`);
      if (u.protocol === "http:" || u.protocol === "https:") readableAcceptUrl = u.href;
    } catch {
      readableAcceptUrl = "";
    }
    const subject = `You’re invited to join ${payload.teamName} on Compass`;
    const bodyHtml = `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(payload.inviterEmail)} invited you to join the <strong>${escapeHtml(payload.teamName)}</strong> team on Compass.</p>
<p style="margin:0 0 16px;line-height:1.5;">Open the link below while signed in with <strong>${escapeHtml(payload.inviteeEmail)}</strong> to accept.</p>
<p style="margin:0 0 16px;"><a href="${acceptHref}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Accept invitation</a></p>
<p style="margin:0;font-size:13px;color:#6b7280;">If the button doesn’t work, copy this URL:<br/><span style="word-break:break-all;">${escapeHtml(readableAcceptUrl || "(link unavailable)")}</span></p>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.inviteeEmail],
        subject,
        html: bodyHtml,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("sendTeamInviteEmail: Resend API error", res.status, errBody);
      throw new Error(`sendTeamInviteEmail: Resend failed ${res.status}: ${errBody}`);
    }
    console.log("sendTeamInviteEmail: sent", { to: payload.inviteeEmail, inviteId });
  },
});
