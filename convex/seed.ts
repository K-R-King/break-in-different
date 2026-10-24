// Seed data: `npx convex run seed:demo` loads the DEMO set, the listings snapshot and the demo login.
// The snapshot (convex/seedData/snapshot.json) is real public listings collected once by
// scripts/build-seed.mjs; it keeps the real source links and goes through the same extraction.
import { createAccount } from "@convex-dev/auth/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { DEMO_EMPLOYERS, DEMO_JOBS, demoApplyUrl } from "../shared/fixtures/demo-jobs";
import { sha256 } from "./lib/text";
import { EXTRACTION_VERSION } from "./ai/prompts";
import snapshot from "./seedData/snapshot.json";

// Demo login for judging. The account starts with no profile, like a fresh sign-up.
export const DEMO_ACCOUNT = { email: "sam@example.com", password: "break-in-different" } as const;

interface SnapshotFile {
  collectedAt: number;
  employers: { slug: string; name: string; boardType: "greenhouse" | "lever"; boardToken: string }[];
  listings: {
    source: string;
    boardToken: string;
    externalId: string;
    title: string;
    roleFamily: (typeof DEMO_JOBS)[number]["roleFamily"];
    location: string;
    workplaceType: (typeof DEMO_JOBS)[number]["workplaceType"];
    descriptionText: string;
    applyUrl: string;
    sourceUrl: string;
    sourceUpdatedAt?: number;
    contentHash: string;
    dedupeKey: string;
  }[];
}

export const demoJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    const now = Date.now();
    for (const e of DEMO_EMPLOYERS) {
      const existing = await ctx.db
        .query("employers")
        .withIndex("by_slug", (q) => q.eq("slug", e.slug))
        .unique();
      const employerId =
        existing?._id ??
        (await ctx.db.insert("employers", {
          slug: e.slug,
          name: e.name,
          description: e.description,
          descriptionSource: "DEMO note written by the team",
          boardType: "demo",
        }));
      for (const j of DEMO_JOBS.filter((x) => x.employer === e.slug)) {
        const found = await ctx.db
          .query("jobs")
          .withIndex("by_source_external", (q) => q.eq("source", "demo").eq("externalId", j.key))
          .unique();
        const doc = {
          source: "demo",
          externalId: j.key,
          employerId,
          title: j.title,
          roleFamily: j.roleFamily,
          experienceLevel: j.experienceLevel,
          experienceEvidence: j.experienceEvidence,
          location: j.location,
          workplaceType: j.workplaceType,
          descriptionText: j.descriptionText,
          summary: j.summary,
          applyUrl: demoApplyUrl(j.key),
          sourceUrl: demoApplyUrl(j.key),
          fetchedAt: now,
          status: "open" as const,
          contentHash: await sha256(j.descriptionText),
          dedupeKey: `demo:${j.key}`,
          skills: j.skills,
          accommodations: j.accommodations,
          extractionVersion: EXTRACTION_VERSION,
          extractedBy: "curated" as const,
          isDemo: true,
        };
        if (found) await ctx.db.replace(found._id, doc);
        else {
          await ctx.db.insert("jobs", doc);
          inserted++;
        }
      }
    }
    return inserted;
  },
});

export const demoAccountExists = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", DEMO_ACCOUNT.email))
      .unique();
    return account !== null;
  },
});

export const demo = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ demoInserted: number; snapshotInserted: number; snapshotCollectedAt: string; demoAccountCreated: boolean }> => {
    const demoInserted: number = await ctx.runMutation(internal.seed.demoJobs, {});
    // Skip if it exists: createAccount throws when someone signed up with this email and another password.
    const demoAccountCreated = !(await ctx.runQuery(internal.seed.demoAccountExists, {}));
    if (demoAccountCreated) {
      await createAccount(ctx, {
        provider: "password",
        account: { id: DEMO_ACCOUNT.email, secret: DEMO_ACCOUNT.password },
        profile: { email: DEMO_ACCOUNT.email },
      });
    }
    const snap = snapshot as unknown as SnapshotFile;
    let snapshotInserted = 0;
    for (let i = 0; i < snap.listings.length; i += 50) {
      const r = await ctx.runMutation(internal.ingest.run.upsertBatch, {
        listings: snap.listings.slice(i, i + 50),
        employers: snap.employers,
        isDemo: false,
        fetchedAt: snap.collectedAt,
      });
      snapshotInserted += r.inserted;
    }
    await ctx.scheduler.runAfter(0, internal.ingest.run.extractPending, {});
    return {
      demoInserted,
      snapshotInserted,
      snapshotCollectedAt: new Date(snap.collectedAt).toISOString(),
      demoAccountCreated,
    };
  },
});

// Used by scripts/build-seed.sh to write convex/seedData/snapshot.json after a live ingest.
export const exportSnapshot = internalQuery({
  args: {},
  handler: async (ctx): Promise<SnapshotFile> => {
    const jobs = (await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "open")).collect()).filter(
      (j) => j.source === "greenhouse" || j.source === "lever",
    );
    const employers = new Map<string, SnapshotFile["employers"][number]>();
    const listings: SnapshotFile["listings"] = [];
    for (const j of jobs) {
      const e = await ctx.db.get(j.employerId);
      if (!e || !e.boardToken || (e.boardType !== "greenhouse" && e.boardType !== "lever")) continue;
      employers.set(e.slug, { slug: e.slug, name: e.name, boardType: e.boardType, boardToken: e.boardToken });
      listings.push({
        source: j.source,
        boardToken: e.boardToken,
        externalId: j.externalId,
        title: j.title,
        roleFamily: j.roleFamily,
        location: j.location,
        workplaceType: j.workplaceType,
        descriptionText: j.descriptionText,
        applyUrl: j.applyUrl,
        sourceUrl: j.sourceUrl,
        sourceUpdatedAt: j.sourceUpdatedAt,
        contentHash: j.contentHash,
        dedupeKey: j.dedupeKey,
      });
    }
    return { collectedAt: Date.now(), employers: [...employers.values()], listings };
  },
});
