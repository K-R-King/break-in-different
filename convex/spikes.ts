// Integration check (spikes S2, S3, S4, S6, S7) with the real sponsor keys.
// Admin only: `npm run check:integrations`. Results contain counts, timings and field names, never keys.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { aiEnabled, lastClaudeError } from "./ai/claude";
import { draftEmailWithClaude, explainMatches, extractListing, extractResumeSkills } from "./ai/prompts";
import { emailIsValid, explanationIsGrounded, verifyAccommodations } from "./ai/validators";
import { scoreJob } from "./match/scorer";
import { cartesiaSse, wavFromPcm16 } from "./tts";
import { cartesiaTranscribe } from "./stt";
import { EMPLOYERS, fetchViaApify } from "./ingest/sources";
import { DEMO_JOBS } from "../shared/fixtures/demo-jobs";

type Result = { check: string; status: "pass" | "fail" | "skipped"; detail: string };

export const run = internalAction({
  args: { pdfBase64: v.optional(v.string()), only: v.optional(v.array(v.string())) },
  handler: async (_ctx, { pdfBase64, only }): Promise<Result[]> => {
    const results: Result[] = [];
    const want = (k: string) => !only || only.includes(k);
    const timed = async <T>(fn: () => Promise<T>) => {
      const t = Date.now();
      const value = await fn();
      return { value, ms: Date.now() - t };
    };
    const job = DEMO_JOBS.find((j) => j.key === "lumen-fullstack")!;
    const conflictJob = DEMO_JOBS.find((j) => j.key === "corvid-backend")!;

    // ---------- Claude ----------
    if (want("claude")) {
      if (!aiEnabled()) {
        results.push({ check: "S2 Claude", status: "skipped", detail: process.env.MOCK_AI === "1" ? "MOCK_AI=1" : "ANTHROPIC_API_KEY not set" });
      } else {
        const listing = await timed(() => extractListing(job.title, job.descriptionText));
        if (!listing.value) results.push({ check: "S2 Claude listing extraction", status: "fail", detail: lastClaudeError() || "no result" });
        else {
          const verified = verifyAccommodations(listing.value.accommodations, job.descriptionText);
          const stated = verified.filter((a) => a.label === "stated").map((a) => a.code);
          const ok = listing.value.skills.length >= 5 && stated.includes("remote_work") && stated.includes("flexible_hours");
          results.push({
            check: "S2 Claude listing extraction",
            status: ok ? "pass" : "fail",
            detail: `${listing.value.skills.length} skills; ${verified.length}/${listing.value.accommodations.length} quotes verified (stated: ${stated.join(", ") || "none"}); level ${listing.value.experienceLevel}; ${listing.ms} ms`,
          });
        }
        const conflict = await extractListing(conflictJob.title, conflictJob.descriptionText);
        const c = conflict ? verifyAccommodations(conflict.accommodations, conflictJob.descriptionText).find((a) => a.code === "remote_work") : null;
        results.push({ check: "S2 Claude conflict detection", status: c?.contradicts ? "pass" : "fail", detail: c ? `remote_work contradicts=${!!c.contradicts}` : lastClaudeError() || "remote_work not returned" });

        if (pdfBase64) {
          const pdf = await timed(() => extractResumeSkills({ pdfBase64 }));
          const n = pdf.value?.length ?? 0;
          results.push({ check: "S7 Claude PDF resume → skills", status: n >= 8 && pdf.ms <= 20000 ? "pass" : "fail", detail: pdf.value ? `${n} skills in ${pdf.ms} ms: ${pdf.value.slice(0, 10).join(", ")}` : lastClaudeError() || "no result" });
        } else results.push({ check: "S7 Claude PDF resume → skills", status: "skipped", detail: "no sample PDF passed" });

        const match = scoreJob({ skills: ["TypeScript", "React", "Node.js"], roleIds: ["full_stack_developer"], requiredAccommodations: ["remote_work"], locationText: "", remotePreference: "remote", profileVersion: 1 }, { jobId: "x", roleFamily: job.roleFamily, skills: job.skills, location: job.location, workplaceType: job.workplaceType, accommodations: job.accommodations })!;
        const expl = await explainMatches([{ id: "x", score: match.score, factors: match.factors }]);
        const text = expl?.get("x") ?? "";
        results.push({ check: "Claude match explanation", status: text && explanationIsGrounded(text, match.factors, match.score) ? "pass" : "fail", detail: text ? `grounded=${explanationIsGrounded(text, match.factors, match.score)}: "${text.slice(0, 140)}"` : lastClaudeError() || "no result" });

        for (const disclose of [false, true]) {
          const d = await draftEmailWithClaude({ jobTitle: job.title, employerName: "Lumen Health Tech", codes: ["remote_work", "flexible_hours"], disclose });
          const valid = !!d && emailIsValid(d, ["remote_work", "flexible_hours"], disclose, [job.title, "Lumen Health Tech"]);
          results.push({ check: `Claude email draft (disclosure ${disclose ? "on" : "off"})`, status: valid ? "pass" : "fail", detail: d ? `validator ${valid ? "passed" : "failed (the app would use the template)"}` : lastClaudeError() || "no result" });
        }
      }
    }

    // ---------- Cartesia ----------
    if (want("cartesia")) {
      const key = process.env.CARTESIA_API_KEY;
      if (!key || process.env.MOCK_AI === "1") results.push({ check: "S3 Cartesia", status: "skipped", detail: key ? "MOCK_AI=1" : "CARTESIA_API_KEY not set" });
      else {
        const sentence = "Find computer science jobs that fit your skills.";
        try {
          const tts = await timed(() => cartesiaSse(key, process.env.CARTESIA_VOICE_ID || "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4", sentence));
          const seconds = tts.value.pcm.length / 2 / 24000;
          const ordered = tts.value.words.every((w, i, a) => w.end >= w.start && (i === 0 || w.start >= a[i - 1].start));
          results.push({ check: "S3 Cartesia TTS + word timestamps", status: tts.value.words.length >= 6 && ordered ? "pass" : "fail", detail: `${seconds.toFixed(1)} s audio, ${tts.value.words.length} word timings (ordered=${ordered}), ${tts.ms} ms` });
          try {
            const wav = wavFromPcm16(tts.value.pcm, 24000);
            const heard = await timed(() => cartesiaTranscribe(key, wav.buffer as ArrayBuffer, "audio/wav"));
            const ok = /computer science/i.test(heard.value);
            results.push({ check: "S6 Cartesia speech-to-text (round trip)", status: ok ? "pass" : "fail", detail: `heard "${heard.value}" in ${heard.ms} ms` });
          } catch (e) {
            results.push({ check: "S6 Cartesia speech-to-text (round trip)", status: "fail", detail: e instanceof Error ? e.message : "error" });
          }
        } catch (e) {
          results.push({ check: "S3 Cartesia TTS + word timestamps", status: "fail", detail: e instanceof Error ? e.message : "error" });
        }
      }
    }

    // ---------- Apify ----------
    if (want("apify")) {
      if (!process.env.APIFY_TOKEN) results.push({ check: "S4 Apify Actor", status: "skipped", detail: "APIFY_TOKEN not set" });
      else {
        const boards = EMPLOYERS.filter((b) => b.boardToken === "stripe" || b.boardToken === "palantir");
        try {
          const r = await timed(() => fetchViaApify(boards, 3));
          const withText = r.value.listings.filter((l) => l.descriptionText.length > 200).length;
          results.push({
            check: "S4 Apify Actor (stripe, palantir; 3 each)",
            status: r.value.listings.length > 0 && withText === r.value.listings.length ? "pass" : "fail",
            detail: `${r.value.rowCount} rows → ${r.value.listings.length} mapped (${withText} with descriptions), boards ${r.value.okBoards.join(", ") || "none"}, ${Math.round(r.ms / 1000)} s; fields: ${r.value.fieldNames.join(", ")}`,
          });
        } catch (e) {
          results.push({ check: "S4 Apify Actor", status: "fail", detail: e instanceof Error ? e.message : "error" });
        }
      }
    }
    return results;
  },
});
