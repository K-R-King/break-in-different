# Open questions and provisional decisions

Answered by the team on 2026-10-24 (recorded in the build conversation):
C1–C6 approved (C4: email + password, login only); C8 Cartesia for speech-to-text; C9 MatchAgent only (no ASI:One JobScout, no Fetch.ai prize claim); Apify existing Store Actor; experience-level filter kept as a filter only, jobs without a level stay visible; repo public; Convex self-hosted in Docker Compose instead of Vercel; Claude models haiku-5-5 (extract) / sonnet-5-5 (write); Roman signs off sources; Mark does labelling and screen-reader passes; Delete all my data at the bottom of Profile; settings as a slide-over; WCAG 2.2 AA.

## Still open

1. **Seed data from Microsoft / Apple career sites.** Requested, but those sites have no public jobs API and the brief excludes scraping without permission. Not collected. Needs Roman's terms review in `docs/sources.md`.
2. **Apify Actor output fields (S4).** Mapped from the Actor's input schema; confirm with a real run once `APIFY_TOKEN` is set (`convex/ingest/sources.ts`, PROVISIONAL).
3. **Cartesia (S3/S6).** TTS SSE and STT batch calls follow the 2026-08-14 API reference; confirm audio + timestamps and credits with a real key.
4. **Claude structured output (S2/S7).** Confirm with a real key that the pinned models return schema-valid JSON and that the sample PDF yields at least 8 skills.
5. **"Delete all my data" also deletes the account.** FR7 says "Deleting the account removes…"; A15 says "a new sign-in starts empty". Implemented as: all rows and the account are removed; signing up again starts empty. Confirm.
6. **Daily ingest cron** runs at 12:00 UTC (05:00 PT). If live data should not change during judging, disable it in `convex/crons.ts` before the demo.

7. **Practice interview (`feat/ai-interview-practice`, 2026-10-24).** Roman built it with the AI area cleared for this feature. It adds `src/routes/PracticePage.tsx`, a `/jobs/:id/practice` route and a button on the Jobs detail panel, so **Karthik should review the `src/` changes**. It also adds a new function contract, `ai/practice:turn` and `ai/practice:feedback`, which should be announced to the team. Details are in `docs/practice-interview.md`.
8. **Practice interview: choices to confirm.** (a) Candidate answers go to Claude with condition words replaced by `[removed]`. This keeps the "no disability data in Claude prompts" rule for listed terms, but free text can still describe a condition in other words. The page tells the user this before they start. (b) Interviewer audio sits in Convex file storage for up to 30 minutes, then is deleted. (c) `convex/tts.ts` now exports `SAMPLE_RATE` and `DEFAULT_VOICE` for reuse, with no behavior change.

## Provisional implementation choices (flagged for review)

- Matching skips the 8 s agent wait when no agent has polled in the last 10 s, so results arrive in under 5 s (A5) when the agent is offline.
- Experience values extracted include `experienced` (3+ years) so senior roles are filtered out when a new-grad level is selected; the filter offers the three designed levels.
- Generic "Software Engineer" titles count as adjacent to Full Stack Developer; "Data Scientist" and "Applied Scientist" as adjacent to ML Engineer.
- Default font is the system sans-serif (brief); the designs' Public Sans was not bundled.
- Push-to-talk is shown whenever signed in (designs); the "Voice control" preference is stored for suggestions and the profile checklist.
- Contract additions: `STT_UNAVAILABLE` error code, `voiceReader` interface preference, `note`/`contradicts` on `AccommodationInfo`, `experienceLevel` on jobs, `matches.list` takes `workSetup` (remote | onsite | any) instead of `remoteOnly`, `account.deleteAll` is a mutation (atomic) rather than an action.
