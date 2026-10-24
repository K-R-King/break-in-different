import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertOwner, requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { enforceLimit } from "./lib/rateLimit";
import { vAccommodationCode } from "./schema";
import { CONDITION_LABELS, LIMITS, type Condition } from "../shared/taxonomy";
import { draftEmailWithClaude } from "./ai/prompts";
import { aiEnabled } from "./ai/claude";
import { emailIsValid } from "./ai/validators";
import { disclosureText, emailTemplate, fillTokens } from "./ai/templates";

const vDraftArgs = {
  jobId: v.id("jobs"),
  accommodationCodes: v.array(vAccommodationCode),
  disclose: v.boolean(),
  conditions: v.array(v.string()), // only used when disclose is true; never sent to Claude
  disclosureFreeText: v.string(),
  extraRequest: v.string(), // inserted verbatim; never sent to Claude
};

export const draft = action({
  args: vDraftArgs,
  handler: async (ctx, args): Promise<{ draftId: Id<"emailDrafts">; generatedBy: "claude" | "template"; aiUnavailable: boolean }> => {
    const userId = await requireUser(ctx);
    if (!args.accommodationCodes.length)
      fail("VALIDATION", "Choose at least one accommodation to ask for.", { field: "accommodationCodes" });
    if (args.disclosureFreeText.length > 500 || args.extraRequest.length > 500) fail("VALIDATION", "Keep each note to 500 characters.");
    const job = await ctx.runQuery(internal.jobs.internalGet, { jobId: args.jobId });
    if (!job) fail("NOT_FOUND", "We could not find that job.");

    const codes = [...new Set(args.accommodationCodes)];
    const conditionLabels = args.disclose
      ? args.conditions.filter((c): c is Condition => c in CONDITION_LABELS).map((c) => CONDITION_LABELS[c])
      : [];
    const disclosure = args.disclose ? disclosureText(conditionLabels, args.disclosureFreeText) : "";
    const disclose = args.disclose && !!disclosure;

    let generatedBy: "claude" | "template" = "template";
    let aiUnavailable = !aiEnabled();
    let base = emailTemplate({ jobTitle: job.title, employerName: job.employerName, codes, disclose });
    if (aiEnabled()) {
      await enforceLimit(ctx, userId, "ai", LIMITS.aiCallsPerHour, 60 * 60 * 1000);
      const out = await draftEmailWithClaude({ jobTitle: job.title, employerName: job.employerName, codes, disclose });
      if (out && emailIsValid(out, codes, disclose, [job.title, job.employerName])) {
        base = out;
        generatedBy = "claude";
      } else if (!out) {
        aiUnavailable = true;
      }
    }
    const body = fillTokens(base.body, job.applyUrl, disclosure, args.extraRequest);
    const draftId = await ctx.runMutation(internal.emails.insertDraft, {
      userId,
      jobId: args.jobId,
      subject: base.subject,
      body,
      accommodationCodes: codes,
      disclosed: disclose,
      disclosedConditions: disclose ? (args.disclosureFreeText.trim() ? ["free_text"] : args.conditions) : [],
      generatedBy,
    });
    return { draftId, generatedBy, aiUnavailable };
  },
});

export const insertDraft = internalMutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    subject: v.string(),
    body: v.string(),
    accommodationCodes: v.array(vAccommodationCode),
    disclosed: v.boolean(),
    disclosedConditions: v.array(v.string()),
    generatedBy: v.union(v.literal("claude"), v.literal("template")),
  },
  handler: async (ctx, args) => ctx.db.insert("emailDrafts", { ...args, edited: false, updatedAt: Date.now() }),
});

export const saveEdit = mutation({
  args: { draftId: v.id("emailDrafts"), subject: v.string(), body: v.string() },
  handler: async (ctx, { draftId, subject, body }) => {
    const userId = await requireUser(ctx);
    const d = assertOwner(await ctx.db.get(draftId), userId, "draft");
    if (!subject.trim()) fail("VALIDATION", "Add a subject.", { field: "subject" });
    if (!body.trim()) fail("VALIDATION", "Add a message.", { field: "body" });
    if (subject.length > 200 || body.length > 6000) fail("VALIDATION", "That message is too long.");
    if (d.subject === subject && d.body === body) return null;
    // Any edit resets approval.
    await ctx.db.patch(draftId, { subject, body, edited: true, approvedAt: undefined, updatedAt: Date.now() });
    return null;
  },
});

export const approve = mutation({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, { draftId }) => {
    const userId = await requireUser(ctx);
    const d = assertOwner(await ctx.db.get(draftId), userId, "draft");
    if (!d.subject.trim() || !d.body.trim()) fail("VALIDATION", "Add a subject and a message before approving.");
    const approvedAt = Date.now();
    await ctx.db.patch(draftId, { approvedAt });
    return { approvedAt };
  },
});

export const get = query({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, { draftId }) => {
    const userId = await requireUser(ctx);
    return assertOwner(await ctx.db.get(draftId), userId, "draft");
  },
});

export const latestForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("emailDrafts")
      .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", jobId))
      .order("desc")
      .first();
  },
});
