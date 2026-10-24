# Open questions and provisional decisions

Answered by the team on 2026-10-24 (recorded in the build conversation):
C1–C6 approved (C4: email + password, login only); C8 Cartesia for speech-to-text; C9 MatchAgent only (no ASI:One JobScout, no Fetch.ai prize claim); Apify existing Store Actor; experience-level filter kept as a filter only, jobs without a level stay visible; repo public; Convex self-hosted in Docker Compose instead of Vercel; Claude models haiku-5-5 (extract) / sonnet-5-5 (write); Roman signs off sources; Mark does labelling and screen-reader passes; Delete all my data at the bottom of Profile; settings as a slide-over; WCAG 2.2 AA.

## Still open

1. **Seed data from Microsoft / Apple career sites.** Requested, but those sites have no public jobs API and the brief excludes scraping without permission. Not collected. Needs Roman's terms review in `docs/sources.md`.
2. **Apify Actor output fields (S4).** Mapped from the Actor's input schema; confirm with a real run once `APIFY_TOKEN` is set (`convex/ingest/sources.ts`, PROVISIONAL).
3. **Cartesia (S3/S6).** TTS SSE and STT batch calls follow the 2026-08-14 API reference; confirm audio + timestamps and credits with a real key.
4. **Claude structured output (S2/S7).** Confirm with a real key that the pinned models return schema-valid JSON and that the sample PDF yields at least 8 skills.
5. **"Delete all my data" also deletes the account.** FR7 says "Deleting the account removes…"; A15 says "a new sign-in starts empty". Implemented as: all rows and the account are removed; signing up again starts empty. Confirm.
6. **Daily ingest cron** (12:00 UTC, 05:00 PT) is now off unless `SCHEDULED_INGEST=1` is set in `.env` (2026-10-24), so demo data does not change during judging. Decide whether to turn it on after the event.
7. **HR contact email from scraped listings** (QA doc, 2026-10-24). Requested so the email's "To" field fills itself. Not built: the Greenhouse and Lever job APIs (and the Apify Actor) return no recruiter or HR address, few listings contain one, and the brief and UI say "We do not look up contacts". Collecting contact details would also need Roman's terms review in `docs/sources.md`. One option: prefill only when an address appears word for word in the listing text, labelled as such. Needs a team decision.

## Provisional implementation choices (flagged for review)

- Matching skips the 8 s agent wait when no agent has polled in the last 10 s, so results arrive in under 5 s (A5) when the agent is offline.
- Experience values extracted include `experienced` (3+ years) so senior roles are filtered out when a new-grad level is selected; the filter offers the three designed levels.
- Generic "Software Engineer" titles count as adjacent to Full Stack Developer; "Data Scientist" and "Applied Scientist" as adjacent to ML Engineer.
- Default font is the system sans-serif (brief); the designs' Public Sans was not bundled.
- Push-to-talk is shown whenever signed in (designs); the "Voice control" preference is stored for suggestions and the profile checklist.
- Accommodation forms (2026-10-24): detected by rules in `convex/ingest/accommodationForm.ts` from listing HTML (form hosts such as forms.gle, or link text/path saying form or request, inside a paragraph about accommodations). Mailto addresses and policy pages are ignored. Jobs with a form rank as if they scored up to 10 points higher (`FORM_BOOST` in `convex/matches.ts`); the shown score is unchanged. PROVISIONAL: the Apify path only detects forms if the Actor returns `description_html`; `scripts/build-seed.sh` uses the direct path.
- The "Hold to talk" keyboard shortcut and mode are saved per device (local storage), not in the profile: keyboards differ between devices, and it avoids a change to `vInterface`.
- Contract additions (2026-10-24, QA fixes): optional `fullName` on profiles and `profiles.save` (omitted keeps the saved name, "" removes it); drafted emails replace `[Your name]` with it in code after any Claude call; new `emails.clear` mutation (owner-checked) empties a draft and resets approval. Optional `accommodationForm { url, quote }` on jobs, returned by `jobs.get` and in `matches.list` items (`job.accommodationForm`, null when none); `ingest/run:run` takes `direct`; `seed:exportSnapshot` takes `since`.
- Contract additions: `STT_UNAVAILABLE` error code, `voiceReader` interface preference, `note`/`contradicts` on `AccommodationInfo`, `experienceLevel` on jobs, `matches.list` takes `workSetup` (remote | onsite | any) instead of `remoteOnly`, `account.deleteAll` is a mutation (atomic) rather than an action.
