// Ingest pipeline: collect → normalize → dedupe → role filter → extract (cached by content hash)
// → evidence check → store. Internal only: cron and `npx convex run ingest/run:run`.
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { LIMITS } from "../../shared/taxonomy";
import { EMPLOYERS, fetchBoardDirect, fetchViaApify, type BoardRef, type RawListing } from "./sources";
import { normalize, type NormalizedListing } from "./normalize";
import { accommodationsFromRules, classifyRole, experienceFromRules, skillsFromRules, summaryFromText } from "./rules";
import { EXTRACTION_VERSION, extractListing } from "../ai/prompts";
import { aiEnabled } from "../ai/claude";
import { verifyAccommodations, verifyQuote } from "../ai/validators";
import { vAccommodationForm, vRoleFamily, vWorkplaceType } from "../schema";

const vListing = v.object({
  source: v.string(),
  boardToken: v.string(),
  externalId: v.string(),
  title: v.string(),
  roleFamily: vRoleFamily,
  location: v.string(),
  workplaceType: vWorkplaceType,
  descriptionText: v.string(),
  applyUrl: v.string(),
  sourceUrl: v.string(),
  sourceUpdatedAt: v.optional(v.number()),
  accommodationForm: v.optional(vAccommodationForm),
  contentHash: v.string(),
  dedupeKey: v.string(),
});

export const run = internalAction({
  // direct: skip Apify and read the public board APIs, which return listing HTML (needed to find accommodation forms).
  // boards: only these board tokens (scripts/build-seed.sh scrapes a few per call to stay under the action time limit).
  args: {
    sources: v.optional(v.array(v.string())),
    boards: v.optional(v.array(v.string())),
    maxBoards: v.optional(v.number()),
    maxJobsPerBoard: v.optional(v.number()),
    direct: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ via: string; status: string; fetched: number; kept: number; inserted: number; updated: number; closed: number }> => {
    const sources = args.sources ?? ["greenhouse", "lever"];
    const boards = EMPLOYERS.filter((b) => sources.includes(b.boardType) && (!args.boards || args.boards.includes(b.boardToken))).slice(
      0,
      Math.min(args.maxBoards ?? 50, 50),
    );
    const perBoard = args.maxJobsPerBoard ?? 15;
    const runId = await ctx.runMutation(internal.ingest.run.startRun, { source: sources.join("+") });
    const employers = boards.map((b) => ({ slug: b.slug, name: b.name, boardType: b.boardType, boardToken: b.boardToken }));
    const keep = (title: string) => classifyRole(title) !== null;
    const totals = { fetched: 0, kept: 0, inserted: 0, updated: 0 };
    const okBoards: string[] = [];
    const seenKeys: string[] = [];

    const store = async (board: BoardRef, raws: RawListing[]) => {
      totals.fetched += raws.length;
      const normalized: NormalizedListing[] = [];
      for (const raw of raws) {
        const n = await normalize(raw, board.name);
        if (n && normalized.length < perBoard) normalized.push(n);
      }
      totals.kept += normalized.length;
      seenKeys.push(...normalized.map((n) => `${n.source}:${n.externalId}`));
      if (!normalized.length) return;
      const r = await ctx.runMutation(internal.ingest.run.upsertBatch, { listings: normalized, employers, isDemo: false });
      totals.inserted += r.inserted;
      totals.updated += r.updated;
    };

    // 1) Apify Store Actor; 2) direct fetch of the same public endpoints, board by board.
    let via = "apify";
    try {
      if (args.direct) throw new Error("DIRECT");
      const r = await fetchViaApify(boards, perBoard * 3);
      if (!r.listings.length) throw new Error("EMPTY");
      for (const b of boards) {
        const rows = r.listings.filter((l) => l.boardToken === b.boardToken && keep(l.title));
        if (rows.length) okBoards.push(b.boardToken);
        await store(b, rows);
      }
    } catch {
      via = "direct";
      for (const b of boards) {
        try {
          const rows = await fetchBoardDirect(b, keep, perBoard);
          if (rows.length) okBoards.push(b.boardToken);
          await store(b, rows);
        } catch {
          /* board skipped; counted below */
        }
        await sleep(1000);
      }
    }
    // Only full-list Apify runs can tell which listings closed; the direct path fetches a capped subset.
    const closed = via === "apify" ? await ctx.runMutation(internal.ingest.run.closeMissing, { okBoards, seenKeys }) : 0;
    const skippedBoards = boards.length - okBoards.length;
    const status = okBoards.length === 0 ? "failed" : skippedBoards ? "partial" : "ok";
    await ctx.runMutation(internal.ingest.run.finishRun, {
      runId,
      status,
      counts: { ...totals, closed, skippedBoards },
      error: status === "failed" ? `no boards returned listings (${via})` : undefined,
    });
    await ctx.scheduler.runAfter(0, internal.ingest.run.extractPending, {});
    return { via, status, ...totals, closed };
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Called by the daily cron. Off by default; set SCHEDULED_INGEST=1 in .env to turn it on.
export const scheduledRun = internalAction({
  args: {},
  handler: async (ctx): Promise<{ skipped: true } | { skipped: false; status: string }> => {
    if (process.env.SCHEDULED_INGEST !== "1") {
      console.log("Scheduled ingest skipped: SCHEDULED_INGEST is not 1.");
      return { skipped: true };
    }
    const r: { status: string } = await ctx.runAction(internal.ingest.run.run, {});
    return { skipped: false, status: r.status };
  },
});

export const listBoards = internalQuery({
  args: {},
  handler: async () => EMPLOYERS.map((b) => b.boardToken),
});

export const startRun = internalMutation({
  args: { source: v.string() },
  handler: async (ctx, { source }) =>
    ctx.db.insert("ingestRuns", {
      source,
      startedAt: Date.now(),
      status: "running",
      counts: { fetched: 0, kept: 0, inserted: 0, updated: 0, closed: 0, skippedBoards: 0 },
    }),
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("ingestRuns"),
    status: v.union(v.literal("ok"), v.literal("partial"), v.literal("failed")),
    counts: v.object({ fetched: v.number(), kept: v.number(), inserted: v.number(), updated: v.number(), closed: v.number(), skippedBoards: v.number() }),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...rest }) => {
    await ctx.db.patch(runId, { ...rest, finishedAt: Date.now() });
  },
});

export const upsertBatch = internalMutation({
  args: {
    listings: v.array(vListing),
    employers: v.array(v.object({ slug: v.string(), name: v.string(), boardType: v.union(v.literal("greenhouse"), v.literal("lever"), v.literal("seed")), boardToken: v.string() })),
    isDemo: v.boolean(),
    fetchedAt: v.optional(v.number()),
  },
  handler: async (ctx, { listings, employers, isDemo, fetchedAt }) => {
    const now = fetchedAt ?? Date.now();
    const employerIds = new Map<string, Id<"employers">>();
    for (const e of employers) {
      const existing = await ctx.db
        .query("employers")
        .withIndex("by_slug", (q) => q.eq("slug", e.slug))
        .unique();
      employerIds.set(e.boardToken, existing?._id ?? (await ctx.db.insert("employers", e)));
    }
    let inserted = 0;
    let updated = 0;
    for (const l of listings) {
      const employerId = employerIds.get(l.boardToken);
      if (!employerId) continue;
      const { boardToken: _b, ...fields } = l;
      void _b;
      const existing = await ctx.db
        .query("jobs")
        .withIndex("by_source_external", (q) => q.eq("source", l.source).eq("externalId", l.externalId))
        .unique();
      if (existing) {
        if (existing.contentHash === l.contentHash) {
          await ctx.db.patch(existing._id, { fetchedAt: now, status: "open", closedAt: undefined, accommodationForm: l.accommodationForm });
        } else {
          await ctx.db.patch(existing._id, { ...fields, fetchedAt: now, status: "open", closedAt: undefined, extractionVersion: 0 });
          updated++;
        }
        continue;
      }
      // Cross-source dedupe: same company + normalized title + location.
      const dup = await ctx.db
        .query("jobs")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", l.dedupeKey))
        .first();
      if (dup) continue;
      await ctx.db.insert("jobs", {
        ...fields,
        employerId,
        experienceLevel: "not_stated",
        fetchedAt: now,
        status: "open",
        skills: [],
        accommodations: [],
        extractionVersion: 0,
        extractedBy: "rules",
        isDemo,
      });
      inserted++;
    }
    return { inserted, updated };
  },
});

export const closeMissing = internalMutation({
  args: { okBoards: v.array(v.string()), seenKeys: v.array(v.string()) },
  handler: async (ctx, { okBoards, seenKeys }) => {
    const seen = new Set(seenKeys);
    const okEmployerIds = new Set<string>();
    for (const token of okBoards) {
      const e = await ctx.db
        .query("employers")
        .withIndex("by_slug", (q) => q.eq("slug", token))
        .unique();
      if (e) okEmployerIds.add(e._id);
    }
    let closed = 0;
    const open = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "open")).collect();
    for (const j of open) {
      if (j.isDemo || (j.source !== "greenhouse" && j.source !== "lever")) continue;
      if (!okEmployerIds.has(j.employerId)) continue; // a failed board never closes its jobs
      if (!seen.has(`${j.source}:${j.externalId}`)) {
        await ctx.db.patch(j._id, { status: "closed", closedAt: Date.now() });
        closed++;
      }
    }
    return closed;
  },
});

// ---------- Extraction ----------

export const pendingExtraction = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const open = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "open")).collect();
    const pending = open.filter((j) => j.extractionVersion < EXTRACTION_VERSION && j.extractedBy !== "curated");
    return {
      remaining: pending.length,
      batch: pending.slice(0, limit).map((j) => ({ _id: j._id, title: j.title, descriptionText: j.descriptionText, contentHash: j.contentHash })),
    };
  },
});

export const cached = internalQuery({
  args: { contentHash: v.string() },
  handler: async (ctx, { contentHash }) =>
    (
      await ctx.db
        .query("extractionCache")
        .withIndex("by_hash", (q) => q.eq("contentHash", contentHash).eq("extractionVersion", EXTRACTION_VERSION))
        .unique()
    )?.result ?? null,
});

export const saveExtraction = internalMutation({
  args: { jobId: v.id("jobs"), contentHash: v.string(), result: v.any(), extractedBy: v.union(v.literal("claude"), v.literal("rules")) },
  handler: async (ctx, { jobId, contentHash, result, extractedBy }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.contentHash !== contentHash) return; // listing changed meanwhile
    await ctx.db.patch(jobId, { ...result, extractionVersion: EXTRACTION_VERSION, extractedBy });
    if (extractedBy === "claude") {
      const existing = await ctx.db
        .query("extractionCache")
        .withIndex("by_hash", (q) => q.eq("contentHash", contentHash).eq("extractionVersion", EXTRACTION_VERSION))
        .unique();
      if (!existing) await ctx.db.insert("extractionCache", { contentHash, extractionVersion: EXTRACTION_VERSION, result });
    }
  },
});

export type StoredExtraction = {
  skills: { name: string; level: "required" | "preferred" }[];
  accommodations: ReturnType<typeof verifyAccommodations>;
  experienceLevel: ReturnType<typeof experienceFromRules>["level"];
  experienceEvidence?: string;
  summary: string;
};

export async function extractOne(title: string, text: string): Promise<{ result: StoredExtraction; by: "claude" | "rules" }> {
  const ai = aiEnabled() ? await extractListing(title, text) : null;
  if (ai) {
    const experienceOk = ai.experienceLevel === "not_stated" || verifyQuote(ai.experienceQuote, `${title}\n${text}`);
    return {
      by: "claude",
      result: {
        skills: ai.skills.filter((s) => s.name.trim() && s.name.length <= 60).slice(0, 30),
        accommodations: verifyAccommodations(ai.accommodations, text),
        experienceLevel: experienceOk ? ai.experienceLevel : "not_stated",
        experienceEvidence: experienceOk && ai.experienceQuote ? ai.experienceQuote.slice(0, 300) : undefined,
        summary: ai.summary.slice(0, 400),
      },
    };
  }
  const exp = experienceFromRules(title, text);
  return {
    by: "rules",
    result: {
      skills: skillsFromRules(text),
      accommodations: verifyAccommodations(accommodationsFromRules(text), text),
      experienceLevel: exp.level,
      experienceEvidence: exp.evidence,
      summary: summaryFromText(text),
    },
  };
}

export const extractPending = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number; remaining: number }> => {
    const { batch, remaining }: { batch: { _id: Id<"jobs">; title: string; descriptionText: string; contentHash: string }[]; remaining: number } = await ctx.runQuery(internal.ingest.run.pendingExtraction, { limit: 10 });
    await Promise.all(
      batch.map(async (job) => {
        const hit = (await ctx.runQuery(internal.ingest.run.cached, { contentHash: job.contentHash })) as StoredExtraction | null;
        if (hit) {
          await ctx.runMutation(internal.ingest.run.saveExtraction, { jobId: job._id, contentHash: job.contentHash, result: hit, extractedBy: "claude" });
          return;
        }
        const { result, by } = await extractOne(job.title, job.descriptionText);
        await ctx.runMutation(internal.ingest.run.saveExtraction, { jobId: job._id, contentHash: job.contentHash, result, extractedBy: by });
      }),
    );
    if (remaining > batch.length) await ctx.scheduler.runAfter(0, internal.ingest.run.extractPending, {});
    return { processed: batch.length, remaining: remaining - batch.length };
  },
});

// Retention: closed listings purged after 30 days.
export const purgeClosed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const closed = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "closed")).collect();
    let n = 0;
    for (const j of closed) {
      if (j.closedAt && Date.now() - j.closedAt > LIMITS.closedListingTtlMs) {
        await ctx.db.delete(j._id);
        n++;
      }
    }
    return n;
  },
});
