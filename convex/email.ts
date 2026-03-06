"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const sendDigestEmail = internalAction({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, { digestRunId }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log("RESEND_API_KEY not set, skipping digest email");
      return;
    }

    const digestRun = await ctx.runQuery(internal.digestRuns.getById, { id: digestRunId });
    if (!digestRun) return;

    const scanRun = await ctx.runQuery(internal.scans.getScanRun, { id: digestRun.scanRunId });
    if (!scanRun?.targetIds?.length) return;

    const targets = await ctx.runQuery(internal.watchTargets.getByIdsInternal, {
      ids: [scanRun.targetIds[0]],
    });
    const target = targets[0];
    if (!target?.userId) return;

    const user = await ctx.runQuery(internal.users.getUserById, { id: target.userId });
    if (!user?.email) return;

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const link = `${appUrl}/targets/${target._id}/digests`;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Compass <notifications@compass.example.com>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject: `Compass: New ${digestRun.period} digest`,
        html: `<p>${digestRun.executiveSummary}</p><p><a href="${link}">View digest</a></p>`,
      }),
    });
    if (!res.ok) {
      console.error("Resend API error:", res.status, await res.text());
    }
  },
});
