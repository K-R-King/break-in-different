import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { accommodationEmailIsCurrent, checkAccommodationEmails, currentAccommodationEmail, findAccommodationContact } from "./lib/accommodationContact";

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
      // The listing's own accommodation statement and request address, if it gives one.
      accommodationContact: findAccommodationContact(job.descriptionText),
      // Addresses the listing gives for accommodation requests, with the listing's own words.
      accommodationEmail: currentAccommodationEmail(job),
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

// Stores a fresh accommodation-email check on open jobs whose stored result is missing or was
// checked against older listing text or an older detector. Run by seed:demo; safe to rerun:
// `npx convex run jobs:refreshAccommodationEmails`.
export const refreshAccommodationEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let refreshed = 0;
    for (const job of await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "open")).collect()) {
      if (accommodationEmailIsCurrent(job)) continue;
      await ctx.db.patch(job._id, { accommodationEmail: checkAccommodationEmails(job.descriptionText, job.contentHash, now) });
      refreshed++;
    }
    return { refreshed };
  },
});
