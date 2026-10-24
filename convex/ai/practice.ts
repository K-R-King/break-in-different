// Interview practice: Claude plays the interviewer, Cartesia gives it a voice.
// Nothing is stored in the database. Each turn's audio goes to file storage only so the browser
// can play it, and is deleted after AUDIO_TTL_MS. The server speaks only lines it wrote, or, in the
// fallback, question text from the browser that passes the same checks as Claude's lines.
import { v } from "convex/values";
import { action, internalMutation, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireUser } from "../lib/auth";
import { fail } from "../lib/errors";
import { enforceLimit } from "../lib/rateLimit";
import { DEFAULT_VOICE, SAMPLE_RATE, cartesiaSse, wavFromPcm16 } from "../tts";
import { aiEnabled } from "./claude";
import { interviewerTurn, plannedQuestions, practiceFeedback, type PracticeFeedback, type PracticeTurn } from "./prompts";
import { scriptedPracticeQuestions, scriptedPracticeTurn } from "./templates";
import { practiceLineIsValid, practiceLineProblem } from "./validators";

const TURNS_PER_HOUR = 60; // turns and feedback requests together
const MAX_TURNS = 24;
const MAX_TEXT = 2000;
const MAX_INTERVIEWER_TURNS = 9; // greeting + 4 questions + follow-ups, then a forced close
const AUDIO_TTL_MS = 30 * 60 * 1000;
const PLAN_QUESTION_MAX = 300;
const MAX_PLAN = 6;

const vHistory = v.array(v.object({ role: v.union(v.literal("interviewer"), v.literal("candidate")), text: v.string() }));

type Word = { word: string; start: number; end: number };
type LineKind = "question" | "followup" | "closing";

function checkHistory(history: PracticeTurn[]) {
  if (history.length > MAX_TURNS) fail("VALIDATION", "This practice is too long. Start a new one.");
  if (history.some((t) => t.text.length > MAX_TEXT)) fail("VALIDATION", "Keep each answer under 2,000 characters.", { field: "answer" });
}

function checkPlan(plan: string[] | undefined) {
  if (!plan) return;
  if (!plan.length || plan.length > MAX_PLAN || plan.some((q) => !practiceLineIsValid(q, PLAN_QUESTION_MAX)))
    fail("VALIDATION", "That question list could not be used. Start the practice again.");
}

// The main questions up front, for candidates who want to see them before starting.
export const plan = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<{ questions: string[]; source: "claude" | "script" }> => {
    const userId = await requireUser(ctx);
    const job = await ctx.runQuery(internal.jobs.internalGet, { jobId });
    if (!job) fail("NOT_FOUND", "We could not find that job.");
    await enforceLimit(ctx, userId, "practice", TURNS_PER_HOUR, 60 * 60 * 1000);
    const skills = job.skills.map((s) => s.name);
    if (aiEnabled()) {
      const out = await plannedQuestions({ jobTitle: job.title, employerName: job.employerName, listing: job.descriptionText, skills });
      const questions = out?.questions.map((q) => q.trim()) ?? [];
      if (questions.length >= 3 && questions.length <= MAX_PLAN && questions.every((q) => practiceLineIsValid(q, PLAN_QUESTION_MAX)))
        return { questions, source: "claude" };
      console.warn("practice: SCRIPTED_PLAN");
    }
    return { questions: scriptedPracticeQuestions(job.title, skills).map((q) => q.ask), source: "script" };
  },
});

export const turn = action({
  args: {
    jobId: v.id("jobs"),
    style: v.union(v.literal("conversation"), v.literal("written")),
    move: v.union(v.literal("start"), v.literal("answer"), v.literal("rephrase")),
    history: vHistory,
    plan: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    { jobId, style, move, history, plan },
  ): Promise<{ text: string; kind: LineKind; source: "claude" | "script"; audio: { url: string; words: Word[] } | null }> => {
    const userId = await requireUser(ctx);
    checkHistory(history);
    checkPlan(plan);
    const last = history[history.length - 1];
    if (move === "start" && history.length) fail("VALIDATION", "This practice has already started.");
    if (move === "answer" && (last?.role !== "candidate" || !last.text.trim()))
      fail("VALIDATION", "Add your answer first.", { field: "answer" });
    if (move === "rephrase" && last?.role !== "interviewer") fail("VALIDATION", "There is no question to say differently yet.");
    const job = await ctx.runQuery(internal.jobs.internalGet, { jobId });
    if (!job) fail("NOT_FOUND", "We could not find that job.");
    await enforceLimit(ctx, userId, "practice", TURNS_PER_HOUR, 60 * 60 * 1000);

    const skills = job.skills.map((s) => s.name);
    const answered = history.filter((t) => t.role === "candidate").length;
    const mustClose = move === "answer" && history.filter((t) => t.role === "interviewer").length >= MAX_INTERVIEWER_TURNS;

    let line: { say: string; kind: LineKind } | null = null;
    let source: "claude" | "script" = "script";
    if (aiEnabled()) {
      const out = await interviewerTurn({
        jobTitle: job.title,
        employerName: job.employerName,
        listing: job.descriptionText,
        skills,
        style,
        history,
        move,
        mustClose,
        plan,
      });
      // Log only the reason class, never the line or the answers.
      const problem = !out ? "NO_RESPONSE" : (practiceLineProblem(out.say) ?? (mustClose && out.kind !== "closing" ? "NOT_CLOSING" : null));
      if (out && !problem) {
        line = { say: out.say.trim(), kind: out.kind };
        source = "claude";
      } else {
        console.warn(`practice: SCRIPTED_TURN ${problem}`);
      }
    }
    if (!line) {
      // Repeating the last question uses browser-sent text, so it must pass the same checks as Claude's lines.
      const repeat = `Here is the question again. ${last?.text ?? ""}`;
      if (move === "rephrase" && !practiceLineProblem(repeat)) line = { say: repeat, kind: "question" };
      else line = scriptedPracticeTurn({ jobTitle: job.title, skills, answered: mustClose ? Infinity : answered, move, planned: plan });
    }

    return { text: line.say, kind: line.kind, source, audio: await speak(ctx, line.say) };
  },
});

// Cartesia voice for one interviewer line. Null means the browser's own voice is used instead.
async function speak(ctx: ActionCtx, text: string): Promise<{ url: string; words: Word[] } | null> {
  const key = process.env.CARTESIA_API_KEY;
  if (!key || process.env.MOCK_AI === "1") return null;
  try {
    const { pcm, words } = await cartesiaSse(key, process.env.CARTESIA_VOICE_ID || DEFAULT_VOICE, text);
    const wav = wavFromPcm16(pcm, SAMPLE_RATE);
    const storageId = await ctx.storage.store(new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" }));
    await ctx.scheduler.runAfter(AUDIO_TTL_MS, internal.ai.practice.forgetAudio, { storageId });
    const url = await ctx.storage.getUrl(storageId);
    return url ? { url, words } : null;
  } catch {
    console.warn("practice: CARTESIA_FAILED");
    return null;
  }
}

export const forgetAudio = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId);
  },
});

export const feedback = action({
  args: { jobId: v.id("jobs"), history: vHistory },
  handler: async (ctx, { jobId, history }): Promise<PracticeFeedback & { source: "claude" | "none" }> => {
    const userId = await requireUser(ctx);
    checkHistory(history);
    if (!history.some((t) => t.role === "candidate" && t.text.trim())) fail("VALIDATION", "Answer at least one question first.");
    const job = await ctx.runQuery(internal.jobs.internalGet, { jobId });
    if (!job) fail("NOT_FOUND", "We could not find that job.");
    await enforceLimit(ctx, userId, "practice", TURNS_PER_HOUR, 60 * 60 * 1000);

    if (aiEnabled()) {
      // Feedback covers answered questions only, so drop any question still waiting for an answer.
      const answeredHistory = history.slice(0, history.map((t) => t.role).lastIndexOf("candidate") + 1);
      const out = await practiceFeedback({ jobTitle: job.title, listing: job.descriptionText, history: answeredHistory });
      const ok =
        out &&
        practiceLineIsValid(out.overall) &&
        out.items.every((i) => practiceLineIsValid(i.question, 200) && practiceLineIsValid(i.worked) && practiceLineIsValid(i.tryNext));
      if (ok) return { ...out, source: "claude" };
    }
    return {
      items: [],
      overall: "AI feedback is unavailable right now. Check each answer for a specific example, what you did yourself, and the result.",
      source: "none",
    };
  },
});
