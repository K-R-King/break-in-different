import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";

// "Delete all my data" (FR7, A15): removes every row tied to the user, including the
// account itself, and returns counts. The client signs out afterwards.
export const deleteAll = mutation({
  args: { confirm: v.literal(true) },
  handler: async (ctx, { confirm }) => {
    if (!confirm) fail("VALIDATION", "Please confirm.");
    const userId = await requireUser(ctx);
    const counts: Record<string, number> = {};
    const del = async (table: string, rows: { _id: never }[]) => {
      for (const r of rows) await ctx.db.delete(r._id);
      counts[table] = rows.length;
    };
    await del("profiles", (await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) as never);
    await del("sensitiveProfiles", (await ctx.db.query("sensitiveProfiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) as never);
    await del("matches", (await ctx.db.query("matches").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) as never);
    await del("matchRequests", (await ctx.db.query("matchRequests").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) as never);
    await del("emailDrafts", (await ctx.db.query("emailDrafts").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) as never);
    await del("applications", (await ctx.db.query("applications").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) as never);
    await del("rateLimits", (await ctx.db.query("rateLimits").withIndex("by_user_kind", (q) => q.eq("userId", userId)).collect()) as never);
    // Convex Auth rows: sessions, refresh tokens, accounts, then the user.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    let refreshTokens = 0;
    for (const s of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
        .collect();
      for (const t of tokens) await ctx.db.delete(t._id);
      refreshTokens += tokens.length;
      await ctx.db.delete(s._id);
    }
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const a of accounts) await ctx.db.delete(a._id);
    await ctx.db.delete(userId);
    counts.account = 1;
    counts.sessions = sessions.length;
    counts.refreshTokens = refreshTokens;
    counts.files = 0; // resume files are deleted right after extraction; none are kept
    return { deleted: counts };
  },
});
