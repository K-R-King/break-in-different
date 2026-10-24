import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { vStatus } from "./schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function upsert(ctx: MutationCtx, userId: Id<"users">, jobId: Id<"jobs">) {
  const job = await ctx.db.get(jobId);
  if (!job) fail("NOT_FOUND", "We could not find that job.");
  const existing = await ctx.db
    .query("applications")
    .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", jobId))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("applications", {
    userId,
    jobId,
    status: "saved",
    notes: "",
    interviews: [],
    updatedAt: Date.now(),
  });
}

// Idempotent: saving twice keeps one row.
export const save = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    return await upsert(ctx, userId, jobId);
  },
});

export const unsave = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("applications")
      .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", jobId))
      .unique();
    if (row && row.status === "saved") await ctx.db.delete(row._id);
    return null;
  },
});

export const markApplied = mutation({
  args: { jobId: v.id("jobs"), emailDraftId: v.optional(v.id("emailDrafts")) },
  handler: async (ctx, { jobId, emailDraftId }) => {
    const userId = await requireUser(ctx);
    if (emailDraftId) assertOwner(await ctx.db.get(emailDraftId), userId, "draft");
    const id = await upsert(ctx, userId, jobId);
    const now = Date.now();
    await ctx.db.patch(id, { status: "applied", appliedAt: now, updatedAt: now, ...(emailDraftId ? { emailDraftId } : {}) });
    return id;
  },
});

export const update = mutation({
  args: {
    applicationId: v.id("applications"),
    status: v.optional(vStatus),
    deadline: v.optional(v.union(v.string(), v.null())),
    followUpDate: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.string()),
    interviews: v.optional(v.array(v.object({ date: v.string(), notes: v.string() }))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const app = assertOwner(await ctx.db.get(args.applicationId), userId, "application");
    for (const [field, value] of [["deadline", args.deadline], ["followUpDate", args.followUpDate]] as const) {
      if (value && (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))))
        fail("VALIDATION", "Enter a valid date.", { field });
    }
    if (args.notes !== undefined && args.notes.length > 2000) fail("VALIDATION", "Keep notes to 2,000 characters.", { field: "notes" });
    if (args.interviews && args.interviews.length > 20) fail("VALIDATION", "Up to 20 interviews per job.", { field: "interviews" });
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status) {
      patch.status = args.status;
      if (args.status === "applied" && !app.appliedAt) patch.appliedAt = Date.now();
    }
    if (args.deadline !== undefined) patch.deadline = args.deadline ?? undefined;
    if (args.followUpDate !== undefined) patch.followUpDate = args.followUpDate ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.interviews) patch.interviews = args.interviews;
    await ctx.db.patch(app._id, patch);
    return null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out = [];
    for (const a of rows) {
      const job = await ctx.db.get(a.jobId);
      const employer = job ? await ctx.db.get(job.employerId) : null;
      const draft = a.emailDraftId
        ? await ctx.db.get(a.emailDraftId)
        : await ctx.db
            .query("emailDrafts")
            .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", a.jobId))
            .order("desc")
            .first();
      out.push({
        _id: a._id,
        jobId: a.jobId,
        status: a.status,
        deadline: a.deadline ?? null,
        followUpDate: a.followUpDate ?? null,
        notes: a.notes,
        interviews: a.interviews,
        appliedAt: a.appliedAt ?? null,
        updatedAt: a.updatedAt,
        job: job
          ? { title: job.title, employerName: employer?.name ?? "", isDemo: job.isDemo, status: job.status, applyUrl: job.applyUrl }
          : null,
        draft: draft ? { _id: draft._id, approvedAt: draft.approvedAt ?? null, updatedAt: draft.updatedAt } : null,
      });
    }
    return out;
  },
});
