import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v, type Validator } from "convex/values";
import {
  ACCOMMODATION_CODES,
  ACCOMMODATION_EVIDENCE,
  APPLICATION_STATUSES,
  CHOSEN_ROLES,
  EXPERIENCE_LEVELS,
  FONT_OPTIONS,
  ROLE_FAMILIES,
} from "../shared/taxonomy";

const lit = <T extends string>(values: readonly T[]) =>
  v.union(...values.map((x) => v.literal(x))) as unknown as Validator<T, "required", never>;

export const vAccommodationCode = lit(ACCOMMODATION_CODES);
export const vChosenRole = lit(CHOSEN_ROLES);
export const vRoleFamily = lit(ROLE_FAMILIES);
export const vExperienceLevel = lit(EXPERIENCE_LEVELS);
export const vStatus = lit(APPLICATION_STATUSES);

export const vInterface = v.object({
  font: lit(FONT_OPTIONS),
  textScale: v.number(),
  lineHeight: v.number(),
  letterSpacing: v.number(),
  wordSpacing: v.number(),
  ttsHighlight: v.boolean(),
  voiceReader: v.boolean(),
  voiceNav: v.boolean(),
  reduceMotion: v.boolean(),
  contrast: v.union(v.literal("standard"), v.literal("high")),
});

export const vRemotePreference = v.union(v.literal("remote"), v.literal("onsite"), v.literal("either"));
export const vWorkplaceType = v.union(
  v.literal("remote"),
  v.literal("hybrid"),
  v.literal("onsite"),
  v.literal("unknown"),
);

export const vJobSkill = v.object({
  name: v.string(),
  level: v.union(v.literal("required"), v.literal("preferred")),
});

export const vAccommodationInfo = v.object({
  code: vAccommodationCode,
  label: lit(ACCOMMODATION_EVIDENCE),
  evidence: v.optional(v.string()),
  evidenceSource: v.optional(v.union(v.literal("listing"), v.literal("curated"))),
  sourceUrl: v.optional(v.string()),
  checkedAt: v.optional(v.string()),
  note: v.optional(v.string()),
  contradicts: v.optional(v.boolean()),
});

export const vSnapshot = v.object({
  skills: v.array(v.string()),
  roleIds: v.array(vChosenRole),
  requiredAccommodations: v.array(vAccommodationCode),
  locationText: v.string(),
  remotePreference: vRemotePreference,
  profileVersion: v.number(),
});

export const vFactors = v.object({
  skills: v.object({
    ratio: v.number(),
    matched: v.array(v.string()),
    missing: v.array(v.string()),
    limitedInfo: v.boolean(),
  }),
  role: v.object({ type: v.union(v.literal("exact"), v.literal("adjacent")) }),
  location: v.object({ fit: v.union(v.literal(0), v.literal(1)), reason: v.string() }),
  conflicts: v.array(v.object({ code: vAccommodationCode, quote: v.string() })),
});

export const vCoverage = v.object({
  requiredStated: v.array(vAccommodationCode),
  requiredNotMentioned: v.array(vAccommodationCode),
  requiredConflicting: v.array(vAccommodationCode),
});

export const vEngine = v.union(v.literal("uagent"), v.literal("fallback"));

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    skills: v.array(v.string()),
    roleIds: v.array(vChosenRole),
    requiredAccommodations: v.array(vAccommodationCode),
    preferredAccommodations: v.array(vAccommodationCode),
    interface: vInterface,
    locationText: v.string(),
    remotePreference: vRemotePreference,
    fullName: v.optional(v.string()), // signs accommodation emails; filled in by code, never sent to Claude
    consent: v.optional(v.object({ resumeProcessing: v.boolean(), at: v.number() })),
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Kept apart so it is never joined into matching, logs or AI calls.
  sensitiveProfiles: defineTable({
    userId: v.id("users"),
    selected: v.array(v.string()),
    otherNeuro: v.string(),
    otherDisability: v.string(),
    useForSuggestions: v.boolean(),
  }).index("by_user", ["userId"]),

  employers: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    descriptionSource: v.optional(v.string()),
    careersUrl: v.optional(v.string()),
    boardType: v.union(v.literal("greenhouse"), v.literal("lever"), v.literal("seed"), v.literal("demo")),
    boardToken: v.optional(v.string()),
    accommodationPageUrl: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  jobs: defineTable({
    source: v.string(), // "greenhouse" | "lever" | "seed" | "demo"
    externalId: v.string(),
    employerId: v.id("employers"),
    title: v.string(),
    roleFamily: vRoleFamily,
    experienceLevel: vExperienceLevel,
    experienceEvidence: v.optional(v.string()),
    location: v.string(),
    workplaceType: vWorkplaceType,
    descriptionText: v.string(),
    summary: v.optional(v.string()),
    applyUrl: v.string(),
    sourceUrl: v.string(),
    sourceUpdatedAt: v.optional(v.number()),
    fetchedAt: v.number(),
    status: v.union(v.literal("open"), v.literal("closed")),
    closedAt: v.optional(v.number()),
    contentHash: v.string(),
    dedupeKey: v.string(),
    skills: v.array(vJobSkill),
    accommodations: v.array(vAccommodationInfo),
    extractionVersion: v.number(),
    extractedBy: v.union(v.literal("claude"), v.literal("rules"), v.literal("curated")),
    isDemo: v.boolean(),
  })
    .index("by_source_external", ["source", "externalId"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_status", ["status"]),

  extractionCache: defineTable({
    contentHash: v.string(),
    extractionVersion: v.number(),
    result: v.any(),
  }).index("by_hash", ["contentHash", "extractionVersion"]),

  matchRequests: defineTable({
    userId: v.id("users"),
    snapshot: vSnapshot,
    jobIds: v.array(v.id("jobs")),
    status: v.union(v.literal("pending"), v.literal("claimed"), v.literal("done")),
    claimedAt: v.optional(v.number()),
    resultAt: v.optional(v.number()),
    engine: v.optional(vEngine),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_user", ["userId"])
    .index("by_created", ["createdAt"]),

  matches: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    score: v.number(),
    factors: vFactors,
    accommodationCoverage: vCoverage,
    explanation: v.string(),
    engine: vEngine,
    profileVersion: v.number(),
    computedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_job", ["userId", "jobId"]),

  emailDrafts: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    subject: v.string(),
    body: v.string(),
    accommodationCodes: v.array(vAccommodationCode),
    disclosed: v.boolean(),
    disclosedConditions: v.array(v.string()),
    generatedBy: v.union(v.literal("claude"), v.literal("template")),
    edited: v.boolean(),
    approvedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_job", ["userId", "jobId"]),

  applications: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    status: vStatus,
    deadline: v.optional(v.string()),
    followUpDate: v.optional(v.string()),
    notes: v.string(),
    interviews: v.array(v.object({ date: v.string(), notes: v.string() })),
    emailDraftId: v.optional(v.id("emailDrafts")),
    appliedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_job", ["userId", "jobId"]),

  ttsCache: defineTable({
    textHash: v.string(),
    model: v.string(),
    voiceId: v.string(),
    storageId: v.id("_storage"),
    words: v.array(v.object({ word: v.string(), start: v.number(), end: v.number() })),
    durationMs: v.number(),
  }).index("by_hash", ["textHash", "voiceId"]),

  // Rolling per-user counters for the per-user limits.
  rateLimits: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_user_kind", ["userId", "kind"]),

  agentPolls: defineTable({ agentId: v.string(), at: v.number() }).index("by_agent", ["agentId"]),

  ingestRuns: defineTable({
    source: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("partial"), v.literal("failed")),
    counts: v.object({
      fetched: v.number(),
      kept: v.number(),
      inserted: v.number(),
      updated: v.number(),
      closed: v.number(),
      skippedBoards: v.number(),
    }),
    error: v.optional(v.string()),
  }),
});
