# Demo script

Before judging: `./scripts/demo.sh reset` (fresh data), confirm `npm run doctor`, open http://localhost:8080 in Chrome, and keep the Loom backup video ready offline.

## Two-minute live demo (judging table)

1. (15 s) Problem and named community: final-year CS students and new grads with accessibility needs applying for Full Stack or ML roles. The 53% figure, with its caveat (self-reported survey, not a prevalence rate).
2. (20 s) Accessibility settings before login: Atkinson Hyperlegible, 150% text. The page restyles live.
3. (25 s) Sign up as Sam. Tick consent, paste the SAMPLE resume (or upload `tests/fixtures/sample-resume.pdf` when the Claude key is set) → skills. Remote work + flexible hours Required, written alternatives Preferred, Full Stack Developer. Point at the private section, collapsed and empty.
4. (30 s) Save and find jobs: score and factor chips, Lumen Health Tech's Stated quotes, the Verified entry, then Fernway's "Not mentioned in this listing" wording and Corvid's quoted on-site conflict (−25). Press Read aloud (Cartesia word highlighting).
5. (20 s) Apply → the email step is prefilled, disclosure is off; Approve → Copy is enabled. Open application page → come back → Mark as applied → Tracker shows Applied with the approved draft.
6. (10 s) `docker compose --env-file .env.docker stop agent`, press Refresh matches → "Scored without the agent". One line per sponsor tool.

## Fallback rehearsal checklist (each once)

- [ ] Agent stopped → "Scored without the agent"
- [ ] No Cartesia key / blocked → "Using your browser's voice"
- [ ] No Claude key → template email + "AI help is unavailable…"
- [ ] No Apify token → direct fetch (`npm run ingest`)
- [ ] Network down → play the Loom backup
