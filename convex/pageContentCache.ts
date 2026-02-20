import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function checkSecret(secret: string): boolean {
  return typeof process.env.SCAN_SECRET === "string" && process.env.SCAN_SECRET.length > 0 && secret === process.env.SCAN_SECRET;
}

/** Get cached formatted page content by URL (normalized). */
export const getByUrl = query({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const doc = await ctx.db
      .query("pageContentCache")
      .withIndex("by_url", (q) => q.eq("url", url))
      .first();
    return doc ? { formattedContent: doc.formattedContent, fetchedAt: doc.fetchedAt } : null;
  },
});

/** Store or update formatted content for a URL. Call from Next.js API with SCAN_SECRET. */
export const setCached = mutation({
  args: {
    secret: v.string(),
    url: v.string(),
    formattedContent: v.string(),
  },
  handler: async (ctx, { secret, url, formattedContent }) => {
    if (!checkSecret(secret)) return null;
    const now = Date.now();
    const existing = await ctx.db
      .query("pageContentCache")
      .withIndex("by_url", (q) => q.eq("url", url))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { formattedContent, fetchedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("pageContentCache", {
      url,
      formattedContent,
      fetchedAt: now,
    });
  },
});
