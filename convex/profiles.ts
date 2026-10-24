import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { vAccommodationCode, vChosenRole, vInterface, vRemotePreference } from "./schema";
import { LIMITS } from "../shared/taxonomy";
import { DEFAULT_INTERFACE } from "../shared/types";
import { canonicalSkill } from "./match/skills";

const vProfileInput = {
  skills: v.array(v.string()),
  roleIds: v.array(vChosenRole),
  requiredAccommodations: v.array(vAccommodationCode),
  preferredAccommodations: v.array(vAccommodationCode),
  interface: vInterface,
  locationText: v.string(),
  remotePreference: vRemotePreference,
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const save = mutation({
  args: vProfileInput,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const skills = dedupe(args.skills.map((s) => s.trim()).filter(Boolean).map(canonicalSkill));
    if (!args.roleIds.length) fail("VALIDATION", "Add at least one role.", { field: "roleIds" });
    if (!skills.length) fail("VALIDATION", "Add at least one skill.", { field: "skills" });
    if (skills.length > LIMITS.maxSkills) fail("VALIDATION", `Keep to ${LIMITS.maxSkills} skills or fewer.`, { field: "skills" });
    if (skills.some((s) => s.length > LIMITS.maxSkillLength))
      fail("VALIDATION", `Each skill must be ${LIMITS.maxSkillLength} characters or fewer.`, { field: "skills" });
    validateInterface(args.interface);
    if (args.locationText.length > 100) fail("VALIDATION", "Keep the location to 100 characters.", { field: "locationText" });
    const preferred = args.preferredAccommodations.filter((c) => !args.requiredAccommodations.includes(c));

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const doc = {
      ...args,
      skills,
      roleIds: dedupe(args.roleIds),
      requiredAccommodations: dedupe(args.requiredAccommodations),
      preferredAccommodations: dedupe(preferred),
      updatedAt: Date.now(),
    };
    if (existing) {
      const version = existing.version + 1;
      await ctx.db.patch(existing._id, { ...doc, version });
      return { version };
    }
    await ctx.db.insert("profiles", { ...doc, userId, version: 1 });
    return { version: 1 };
  },
});

// Interface preferences can be saved on their own (settings panel) before a full profile exists.
export const saveInterface = mutation({
  args: { interface: vInterface },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    validateInterface(args.interface);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { interface: args.interface, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        skills: [],
        roleIds: [],
        requiredAccommodations: [],
        preferredAccommodations: [],
        interface: args.interface,
        locationText: "",
        remotePreference: "either",
        version: 0,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

// ----- Optional private selection (sensitiveProfiles). Never read by matching or AI code. -----

export const getSensitive = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("sensitiveProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return row ? { selected: row.selected, otherNeuro: row.otherNeuro, otherDisability: row.otherDisability } : null;
  },
});

export const saveSensitive = mutation({
  args: { selected: v.array(v.string()), otherNeuro: v.string(), otherDisability: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.otherNeuro.length > 200 || args.otherDisability.length > 200)
      fail("VALIDATION", "Keep each text field to 200 characters.");
    const existing = await ctx.db
      .query("sensitiveProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const empty = !args.selected.length && !args.otherNeuro.trim() && !args.otherDisability.trim();
    if (existing && empty) {
      await ctx.db.delete(existing._id);
      return null;
    }
    if (empty) return null;
    const doc = { ...args, selected: dedupe(args.selected), useForSuggestions: true };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("sensitiveProfiles", { ...doc, userId });
    return null;
  },
});

export const internalGet = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
});

function validateInterface(i: typeof DEFAULT_INTERFACE) {
  if (i.textScale < 1 || i.textScale > 2) fail("VALIDATION", "Text size must be 100% to 200%.", { field: "textScale" });
  if (i.lineHeight < 1.2 || i.lineHeight > 2.4) fail("VALIDATION", "Line spacing must be 1.2 to 2.4.", { field: "lineHeight" });
  if (i.letterSpacing < 0 || i.letterSpacing > 0.12) fail("VALIDATION", "Letter spacing must be 0 to 0.12em.", { field: "letterSpacing" });
  if (i.wordSpacing < 0 || i.wordSpacing > 0.16) fail("VALIDATION", "Word spacing must be 0 to 0.16em.", { field: "wordSpacing" });
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
