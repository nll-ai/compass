"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    const targetIdsInRun = new Set(scanRun.targetIds);

    const targets = await ctx.runQuery(internal.watchTargets.getByIdsInternal, {
      ids: scanRun.targetIds,
    });
    const targetById = new Map(targets.map((t) => [t._id, t]));

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Compass <notifications@compass.example.com>";
    const dateStr = new Date(digestRun.generatedAt).toLocaleDateString("en-US", {
      dateStyle: "medium",
    });

    type Recipient = { userId: Id<"users">; email: string };
    let recipients: Recipient[] = [];

    if (scanRun.digestNotifyUserIds && scanRun.digestNotifyUserIds.length > 0) {
      for (const uid of scanRun.digestNotifyUserIds) {
        const user = await ctx.runQuery(internal.users.getUserById, { id: uid });
        if (user?.email) recipients.push({ userId: uid, email: user.email });
      }
    } else {
      const first = targets[0];
      if (first?.userId) {
        const user = await ctx.runQuery(internal.users.getUserById, { id: first.userId });
        if (user?.email) recipients.push({ userId: first.userId, email: user.email });
      }
    }

    if (recipients.length === 0) {
      console.log("sendDigestEmail: no recipients, skipping");
      return;
    }

    for (const { userId, email } of recipients) {
      const subIds = await ctx.runQuery(
        internal.targetSubscriptions.getSubscribedWatchTargetIdsForUserInternal,
        { userId },
      );
      const allowed =
        subIds === null ? targetIdsInRun : new Set(subIds);

      const itemsForUser = allItems.filter((item) => allowed.has(item.watchTargetId));
      const itemsByTarget = new Map<Id<"watchTargets">, typeof allItems>();
      for (const item of itemsForUser) {
        const list = itemsByTarget.get(item.watchTargetId) ?? [];
        list.push(item);
        itemsByTarget.set(item.watchTargetId, list);
      }

      const hubLink = `${appUrl}/targets`;
      let bodyHtml = `<h1 style="font-size:18px;margin:0 0 12px;">Compass ${digestRun.period} digest — ${escapeHtml(dateStr)}</h1>`;
      bodyHtml += `<p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(digestRun.executiveSummary)}</p>`;

      const sortedTargetIds = [...itemsByTarget.keys()].sort((a, b) => {
        const na = targetById.get(a)?.displayName ?? "";
        const nb = targetById.get(b)?.displayName ?? "";
        return na.localeCompare(nb);
      });

      for (const tid of sortedTargetIds) {
        const t = targetById.get(tid);
        const name = t?.displayName ?? "Watch target";
        const digestLink = `${appUrl}/targets/${tid}/digests`;
        bodyHtml += `<h2 style="font-size:15px;margin:20px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">${escapeHtml(name)}</h2>`;
        bodyHtml += `<p style="margin:0 0 8px;font-size:13px;"><a href="${digestLink}">View full digest for ${escapeHtml(name)}</a></p>`;
        const items = itemsByTarget.get(tid) ?? [];
        bodyHtml += "<ul style=\"margin:0;padding-left:1.25rem;\">";
        for (const it of items) {
          const sig = it.significance;
          const cat = it.category.replace(/_/g, " ");
          bodyHtml += `<li style="margin-bottom:10px;line-height:1.45;"><strong>${escapeHtml(sig)}</strong> · ${escapeHtml(cat)} — ${escapeHtml(it.headline)}`;
          if (it.synthesis && it.synthesis.length > 0) {
            const syn = it.synthesis.length > 220 ? `${it.synthesis.slice(0, 220)}…` : it.synthesis;
            bodyHtml += `<br/><span style="font-size:13px;color:#4b5563;">${escapeHtml(syn)}</span>`;
          }
          bodyHtml += "</li>";
        }
        bodyHtml += "</ul>";
      }

      if (sortedTargetIds.length === 0) {
        bodyHtml += `<p style="margin:12px 0;color:#6b7280;font-size:14px;">No per-target signals in this digest for you. <a href="${hubLink}">Open Watch Targets</a></p>`;
      }

      bodyHtml += `<p style="margin-top:20px;font-size:13px;"><a href="${hubLink}">Open Compass — Watch Targets</a></p>`;

      const multi = scanRun.targetIds.length > 1;
      const subject = multi
        ? `Compass: ${digestRun.period} digest (${scanRun.targetIds.length} targets)`
        : `Compass: New ${digestRun.period} digest`;

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
        console.error("sendDigestEmail: Resend API error", res.status, await res.text());
      } else {
        console.log("sendDigestEmail: sent successfully", { to: email });
      }
    }
  },
});
