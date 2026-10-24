import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { enforceLimit } from "./lib/rateLimit";
import { vEngine, vFactors, vCoverage } from "./schema";
import { LIMITS, ROLE_ADJACENCY, type ChosenRole, type RoleFamily } from "../shared/taxonomy";
import type { CandidateJob, MatchResult, MatchSnapshot } from "../shared/types";
import { scoreJob, templateExplanation } from "./match/scorer";
import { explainMatches } from "./ai/prompts";
import { aiEnabled } from "./ai/claude";
import { explanationIsGrounded } from "./ai/validators";

const AGENT_ALIVE_MS = 10_000;

export function toCandidate(job: Doc<"jobs">): CandidateJob {
  return {
    jobId: job._id,
    roleFamily: job.roleFamily,
    skills: job.skills,
    location: job.location,
    workplaceType: job.workplaceType,
    accommodations: job.accommodations.map((a) => ({ code: a.code, label: a.label, evidence: a.evidence, contradicts: a.contradicts })),
  };
}

function allowedFamilies(roleIds: ChosenRole[]): Set<RoleFamily> {
  const s = new Set<RoleFamily>(roleIds);
  for (const r of roleIds) for (const f of ROLE_ADJACENCY[r]) s.add(f);
  return s;
}

async function candidateJobs(ctx: QueryCtx, roleIds: ChosenRole[]) {
  const families = allowedFamilies(roleIds);
  const open = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "open")).collect();
  // Only listings that have been through extraction (or are curated) are matched.
  return open.filter((j) => families.has(j.roleFamily) && (j.extractionVersion > 0 || j.extractedBy === "curated"));
}

// ---------- Request lifecycle ----------

export const createRequest = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile || !profile.roleIds.length || !profile.skills.length)
      fail("PROFILE_INCOMPLETE", "Add at least one role and one skill to your profile first.");
    // The snapshot is built field by field: no disability data and no account identifiers.
    const snapshot: MatchSnapshot = {
      skills: profile.skills,
      roleIds: profile.roleIds,
      requiredAccommodations: profile.requiredAccommodations,
      locationText: profile.locationText,
      remotePreference: profile.remotePreference,
      profileVersion: profile.version,
    };
    const jobs = await candidateJobs(ctx, profile.roleIds);
    const requestId = await ctx.db.insert("matchRequests", {
      userId,
      snapshot,
      jobIds: jobs.map((j) => j._id),
      status: "pending",
      createdAt: Date.now(),
    });
    const lastPoll = await ctx.db.query("agentPolls").order("desc").first();
    return { requestId, agentAlive: !!lastPoll && Date.now() - lastPoll.at < AGENT_ALIVE_MS };
  },
});

export const getRequest = internalQuery({
  args: { requestId: v.id("matchRequests") },
  handler: async (ctx, { requestId }) => {
    const r = await ctx.db.get(requestId);
    return r ? { status: r.status, engine: r.engine } : null;
  },
});

async function replaceMatches(ctx: MutationCtx, request: Doc<"matchRequests">, results: MatchResult[]) {
  const old = await ctx.db
    .query("matches")
    .withIndex("by_user", (q) => q.eq("userId", request.userId))
    .collect();
  for (const m of old) await ctx.db.delete(m._id);
  const now = Date.now();
  for (const r of results) {
    await ctx.db.insert("matches", {
      userId: request.userId,
      jobId: r.jobId as Id<"jobs">,
      score: r.score,
      factors: r.factors,
      accommodationCoverage: r.accommodationCoverage,
      explanation: r.explanation,
      engine: r.engine,
      profileVersion: request.snapshot.profileVersion,
      computedAt: now,
    });
  }
}

// Fallback engine: runs when no agent finished within the wait window.
export const completeWithFallback = internalMutation({
  args: { requestId: v.id("matchRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request || request.status === "done") return false;
    const results: MatchResult[] = [];
    for (const id of request.jobIds) {
      const job = await ctx.db.get(id);
      if (!job || job.status !== "open") continue;
      const r = scoreJob(request.snapshot, toCandidate(job), "fallback");
      if (r) results.push(r);
    }
    await replaceMatches(ctx, request, results);
    await ctx.db.patch(requestId, { status: "done", engine: "fallback", resultAt: Date.now() });
    return true;
  },
});

export const run = action({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx): Promise<{ requestId: Id<"matchRequests">; engine: "uagent" | "fallback" }> => {
    const userId = await requireUser(ctx);
    const { requestId, agentAlive } = await ctx.runMutation(internal.matches.createRequest, { userId });
    // Wait for the MatchAgent only if it has polled recently; otherwise score straight away.
    if (agentAlive) {
      const deadline = Date.now() + LIMITS.agentWaitMs;
      while (Date.now() < deadline) {
        const r = await ctx.runQuery(internal.matches.getRequest, { requestId });
        if (r?.status === "done") break;
        await new Promise((res) => setTimeout(res, 300));
      }
    }
    await ctx.runMutation(internal.matches.completeWithFallback, { requestId });
    const final = await ctx.runQuery(internal.matches.getRequest, { requestId });
    const engine = final?.engine ?? "fallback";
    if (aiEnabled()) {
      try {
        await enforceLimit(ctx, userId, "ai", LIMITS.aiCallsPerHour, 60 * 60 * 1000);
        await ctx.scheduler.runAfter(0, internal.matches.explain, { userId });
      } catch {
        // Over the AI limit: keep the template explanations.
      }
    }
    return { requestId, engine };
  },
});

// ---------- Agent endpoints (called from http.ts) ----------

export const claimNext = internalMutation({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    const now = Date.now();
    const poll = await ctx.db
      .query("agentPolls")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .unique();
    if (poll && now - poll.at < 200) return { rateLimited: true as const };
    if (poll) await ctx.db.patch(poll._id, { at: now });
    else await ctx.db.insert("agentPolls", { agentId, at: now });

    const pending = await ctx.db
      .query("matchRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending").gt("createdAt", now - LIMITS.agentWaitMs))
      .first();
    if (!pending) return { request: null };
    await ctx.db.patch(pending._id, { status: "claimed", claimedAt: now });
    const jobs: CandidateJob[] = [];
    for (const id of pending.jobIds) {
      const job = await ctx.db.get(id);
      if (job) jobs.push(toCandidate(job));
    }
    // Only the anonymous snapshot and public job fields leave Convex.
    return { request: { requestId: pending._id as string, snapshot: pending.snapshot, jobs } };
  },
});

export const storeAgentResults = internalMutation({
  args: {
    requestId: v.string(),
    results: v.array(
      v.object({
        jobId: v.string(),
        score: v.number(),
        factors: vFactors,
        accommodationCoverage: vCoverage,
        explanation: v.string(),
        engine: vEngine,
      }),
    ),
  },
  handler: async (ctx, { requestId, results }) => {
    const id = ctx.db.normalizeId("matchRequests", requestId);
    const request = id ? await ctx.db.get(id) : null;
    if (!request) return { status: 404 as const };
    if (request.status === "done") return { status: 409 as const };
    const allowed = new Set<string>(request.jobIds);
    if (results.some((r) => !allowed.has(r.jobId) || r.score < 0 || r.score > 100)) return { status: 400 as const };
    await replaceMatches(
      ctx,
      request,
      results.map((r) => ({ ...r, engine: "uagent" as const, explanation: templateExplanation(r.factors) })),
    );
    await ctx.db.patch(request._id, { status: "done", engine: "uagent", resultAt: Date.now() });
    return { status: 200 as const };
  },
});

// ---------- Explanations: Claude sees factor data only ----------

export const topForExplain = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("matches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((m) => ({ id: m._id as string, score: m.score, factors: m.factors }));
  },
});

export const setExplanations = internalMutation({
  args: { items: v.array(v.object({ id: v.id("matches"), text: v.string() })) },
  handler: async (ctx, { items }) => {
    for (const it of items) {
      const m = await ctx.db.get(it.id);
      if (m) await ctx.db.patch(it.id, { explanation: it.text });
    }
  },
});

export const explain = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const items = await ctx.runQuery(internal.matches.topForExplain, { userId });
    const texts = await explainMatches(items);
    if (!texts) return;
    const accepted: { id: Id<"matches">; text: string }[] = [];
    for (const it of items) {
      const t = texts.get(it.id)?.trim();
      if (t && explanationIsGrounded(t, it.factors, it.score)) accepted.push({ id: it.id as Id<"matches">, text: t });
    }
    if (accepted.length) await ctx.runMutation(internal.matches.setExplanations, { items: accepted });
  },
});

// Retention: match requests are purged after 24 hours.
export const purgeRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("matchRequests")
      .withIndex("by_created", (q) => q.lt("createdAt", Date.now() - LIMITS.matchRequestTtlMs))
      .collect();
    for (const r of old) await ctx.db.delete(r._id);
    return old.length;
  },
});

// ---------- Reads ----------

export const list = query({
  args: {
    workSetup: v.optional(v.union(v.literal("remote"), v.literal("onsite"), v.literal("any"))),
    locationText: v.optional(v.string()),
    statesAllRequired: v.optional(v.boolean()),
    experience: v.optional(v.array(v.string())),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("matches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const appByJob = new Map(apps.map((a) => [a.jobId as string, a]));
    const loc = args.locationText?.trim().toLowerCase();
    const search = args.search?.trim().toLowerCase();
    const levels = new Set(args.experience ?? []);

    const items = [];
    for (const m of rows) {
      const job = await ctx.db.get(m.jobId);
      if (!job || job.status !== "open") continue;
      const employer = await ctx.db.get(job.employerId);
      const employerName = employer?.name ?? "";
      if (args.workSetup === "remote" && job.workplaceType !== "remote") continue;
      if (args.workSetup === "onsite" && job.workplaceType === "remote") continue;
      if (loc && !job.location.toLowerCase().includes(loc)) continue;
      if (args.statesAllRequired && (m.accommodationCoverage.requiredNotMentioned.length || m.accommodationCoverage.requiredConflicting.length)) continue;
      // Experience is a filter only; jobs that state no level stay visible.
      if (levels.size && job.experienceLevel !== "not_stated" && !levels.has(job.experienceLevel)) continue;
      if (search) {
        const hay = [job.title, employerName, ...job.skills.map((s) => s.name)].join(" ").toLowerCase();
        if (!hay.includes(search)) continue;
      }
      items.push({
        matchId: m._id,
        jobId: job._id,
        score: m.score,
        factors: m.factors,
        accommodationCoverage: m.accommodationCoverage,
        explanation: m.explanation,
        engine: m.engine,
        job: {
          title: job.title,
          employerName,
          location: job.location,
          workplaceType: job.workplaceType,
          experienceLevel: job.experienceLevel,
          source: job.source,
          sourceUrl: job.sourceUrl,
          applyUrl: job.applyUrl,
          fetchedAt: job.fetchedAt,
          isDemo: job.isDemo,
          accommodations: job.accommodations,
        },
        saved: appByJob.has(job._id),
        applicationStatus: appByJob.get(job._id)?.status ?? null,
      });
    }
    items.sort((a, b) => b.score - a.score);

    const lastRequest = await ctx.db
      .query("matchRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    const lastIngest = await ctx.db.query("ingestRuns").order("desc").first();
    const liveFresh =
      !!lastIngest && lastIngest.status !== "failed" && Date.now() - lastIngest.startedAt < LIMITS.staleListingHours * 3600_000;
    return {
      items: items.slice(0, 100),
      totalMatches: rows.length,
      engine: lastRequest?.engine ?? null,
      hasRun: !!lastRequest,
      usingSavedListings: !liveFresh,
    };
  },
});
