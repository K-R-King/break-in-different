import { v } from "convex/values";
import { PDFDocument } from "pdf-lib";
import { action, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { enforceLimit } from "./lib/rateLimit";
import { LIMITS } from "../shared/taxonomy";
import { extractResumeSkills } from "./ai/prompts";
import { aiEnabled } from "./ai/claude";
import { canonicalSkill, findSkillsInText } from "./match/skills";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const recordConsent = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (p) await ctx.db.patch(p._id, { consent: { resumeProcessing: true, at: Date.now() } });
  },
});

export const extractSkills = action({
  args: { storageId: v.optional(v.id("_storage")), text: v.optional(v.string()), consent: v.boolean() },
  handler: async (ctx, { storageId, text, consent }): Promise<{ skills: string[]; warnings: string[]; engine: "claude" | "rules" }> => {
    const userId = await requireUser(ctx);
    try {
      if (!consent) fail("CONSENT_REQUIRED", "Tick the consent box to let us read your resume, or add skills by hand.", { field: "consent" });
      if (!storageId && !text?.trim()) fail("VALIDATION", "Upload a PDF or paste your resume text.");
      await enforceLimit(ctx, userId, storageId ? "resume_upload" : "resume_text", LIMITS.resumeUploadsPerDay, DAY);

      let pdfBase64: string | undefined;
      if (storageId) {
        const blob = await ctx.storage.get(storageId);
        if (!blob) fail("NOT_FOUND", "We could not find that upload. Please try again.", { retryable: true });
        if (blob.size > LIMITS.resumeMaxBytes) fail("FILE_TOO_LARGE", "That file is over 5 MB. Try a smaller PDF or paste the text.");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!isPdf(bytes)) fail("UNSUPPORTED_TYPE", "Only PDF files work here. You can paste the text instead.");
        let pages = 0;
        try {
          pages = (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
        } catch {
          fail("EXTRACTION_FAILED", "We could not read this file. Paste the text instead.");
        }
        if (pages > LIMITS.resumeMaxPages) fail("FILE_TOO_LARGE", "That PDF has more than 10 pages. Try a shorter one or paste the text.");
        pdfBase64 = toBase64(bytes);
      } else if ((text ?? "").length > 50000) {
        fail("FILE_TOO_LARGE", "That text is too long. Paste just your resume.");
      }

      await ctx.runMutation(internal.resume.recordConsent, { userId });
      const warnings: string[] = [];
      let skills: string[] | null = null;
      let engine: "claude" | "rules" = "claude";
      if (aiEnabled()) {
        await enforceLimit(ctx, userId, "ai", LIMITS.aiCallsPerHour, HOUR);
        skills = await extractResumeSkills(pdfBase64 ? { pdfBase64 } : { text });
      }
      if (!skills) {
        engine = "rules";
        if (pdfBase64) fail("EXTRACTION_FAILED", "AI help is unavailable, so we could not read the PDF. Paste the text instead, or add skills by hand.", { retryable: true });
        skills = findSkillsInText(text ?? "");
        warnings.push("AI help is unavailable. We matched skills from a fixed list, so check them and add any we missed.");
      }
      const clean = [...new Set(skills.map((s) => canonicalSkill(s.trim())).filter((s) => s && s.length <= LIMITS.maxSkillLength))].slice(0, 40);
      if (!clean.length) warnings.push("We could not find any skills. Add skills by hand.");
      return { skills: clean, warnings, engine };
    } finally {
      // Retention: the resume file is deleted right after extraction, whatever happened.
      if (storageId) await ctx.storage.delete(storageId).catch(() => undefined);
    }
  },
});

function isPdf(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
