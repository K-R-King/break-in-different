import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { fail } from "./errors";

// Fixed-window per-user counter. Returns false when the limit is reached.
export const hit = internalMutation({
  args: { userId: v.id("users"), kind: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, { userId, kind, limit, windowMs }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
      .unique();
    if (!row || now - row.windowStart >= windowMs) {
      if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("rateLimits", { userId, kind, windowStart: now, count: 1 });
      return true;
    }
    if (row.count >= limit) return false;
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return true;
  },
});

export async function enforceLimit(
  ctx: ActionCtx,
  userId: Id<"users">,
  kind: string,
  limit: number,
  windowMs: number,
) {
  const ok = await ctx.runMutation(internal.lib.rateLimit.hit, { userId, kind, limit, windowMs });
  if (!ok) fail("RATE_LIMITED", "You have reached the limit for now. Please try again later.", { retryable: true });
}
