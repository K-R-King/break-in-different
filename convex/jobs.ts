import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";

export const get = query({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    const id = ctx.db.normalizeId("jobs", jobId);
    const job = id ? await ctx.db.get(id) : null;
    if (!job) fail("NOT_FOUND", "We could not find that job. It may have closed.");
    const employer = await ctx.db.get(job.employerId);
    const match = await ctx.db
      .query("matches")
      .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", job._id))
      .unique();
    const application = await ctx.db
      .query("applications")
      .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", job._id))
      .unique();
    return {
      _id: job._id,
      title: job.title,
      roleFamily: job.roleFamily,
      experienceLevel: job.experienceLevel,
      experienceEvidence: job.experienceEvidence,
      location: job.location,
      workplaceType: job.workplaceType,
      descriptionText: job.descriptionText,
      summary: job.summary,
      applyUrl: job.applyUrl,
      accommodationForm: job.accommodationForm ?? null,
      sourceUrl: job.sourceUrl,
      source: job.source,
      fetchedAt: job.fetchedAt,
      status: job.status,
      skills: job.skills,
      accommodations: job.accommodations,
      isDemo: job.isDemo,
      employer: employer
        ? { name: employer.name, description: employer.description, descriptionSource: employer.descriptionSource, careersUrl: employer.careersUrl }
        : null,
      match: match
        ? { score: match.score, factors: match.factors, accommodationCoverage: match.accommodationCoverage, explanation: match.explanation, engine: match.engine }
        : null,
      application: application ? { _id: application._id, status: application.status } : null,
    };
  },
});

export const internalGet = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const employer = await ctx.db.get(job.employerId);
    return { ...job, employerName: employer?.name ?? "the employer" };
  },
});

// Public job text for read-aloud, capped at 1,500 characters.
export const speakableText = internalQuery({
  args: { jobId: v.id("jobs"), section: v.union(v.literal("summary"), v.literal("full")) },
  handler: async (ctx, { jobId, section }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const text = section === "summary" ? job.summary || job.descriptionText : job.descriptionText;
    return text.slice(0, 1500);
  },
});
