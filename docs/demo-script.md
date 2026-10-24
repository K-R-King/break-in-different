# Demo script

Before judging: `./scripts/demo.sh reset` (fresh data), confirm `npm run doctor`, open http://localhost:8080 in Chrome, and keep the Loom backup video ready offline. After a reset, wait about 5 minutes before step 4: Claude reads all 369 listings first, and matching only sees listings it has finished. Without a Claude key the rules finish in seconds.

Demo login (created by the seed, empty profile): `sam@example.com` / `break-in-different`.

## Two-minute live demo (judging table)

1. (15 s) Problem and named community: final-year CS students and new grads with accessibility needs applying for Full Stack or ML roles. The 53% figure, with its caveat (self-reported survey, not a prevalence rate).
<<<<<<< HEAD
2. (15 s) Accessibility settings before login: Atkinson Hyperlegible, 150% text. The page restyles live.
3. (20 s) Log in as Sam. Full name "Sam Rivera" (it signs the email). Tick consent, paste the SAMPLE resume (or upload `tests/fixtures/sample-resume.pdf` when the Claude key is set) → skills. Remote work + flexible hours Required, written alternatives Preferred, Full Stack Developer. Point at the private section, collapsed and empty.
4. (35 s) Save and find jobs. The first cards carry an "Accommodation form" badge: those employers link their own request form, so they come first, then by match score. Open the first one: the quote and "Open the employer's form". Then search "Lumen": score and factor chips, Lumen Health Tech's Stated quotes, the Verified entry, Read aloud (Cartesia word highlighting). Search "Fernway" for "Not mentioned in this listing" wording, then "Corvid" for the quoted on-site conflict (−25); tick "Hide jobs that conflict with my required accommodations" and Corvid drops out; the empty state explains that silent listings are not "unavailable" and offers a way forward. Untick it and clear the search.
5. (20 s) Search "Lumen" → Apply on Full Stack Developer → the email step is prefilled, signed "Sam Rivera", disclosure is off; Approve → Copy is enabled. Open application page → come back → Mark as applied → Tracker shows Applied with the approved draft. If time allows: search "Figma" → "This employer accepts accommodation requests" → "Draft a request to accommodations-ext@figma.com" → To is filled in from the listing.
6. (25 s) Back on Jobs, press Practice an interview → Start practice. The interviewer (Claude) speaks the first question in Cartesia's voice with word highlighting. Hold to answer and speak one sentence. Point out the follow-up question, "No time limit", and "I need a moment". Then End and get feedback, which covers content only.
7. (10 s) `docker compose --env-file .env.docker stop agent`, press Refresh matches → "Scored without the agent". One line per sponsor tool.

## Fallback rehearsal checklist (each once)

- [ ] Agent stopped → "Scored without the agent"
- [ ] No Cartesia key / blocked → "Using your browser's voice"
- [ ] No Claude key → template email + "AI help is unavailable…"
- [ ] No Claude key → practice uses the scripted interviewer + "This question is from our standard practice set…"
- [ ] No Apify token → direct fetch (`npm run ingest`)
- [ ] Network down → play the Loom backup
- [ ] Profile without a Full name → the draft says "[Your name]" and Approve stays blocked until it is replaced
