# Break In Different

An inclusive career platform that helps job seekers with diverse accessibility needs find computer science roles, through personalized application support and tailored job matching. Built for Cal Hacks 13.0.

**The loop:** sign up → build a profile (skills from a resume, roles, required and preferred workplace accommodations, interface preferences) → see ranked CS jobs whose accommodation information is labelled with quoted evidence → draft an accommodation email you review and approve → apply on the employer's own site → track it.

What it never does: send anything for you, auto-apply, ask for a diagnosis, or say an employer lacks an accommodation. If a listing says nothing, the app says "Not mentioned in this listing. This does not mean it is unavailable."

## Run with Docker Compose (recommended for demos)

Prerequisites: Docker Desktop, `openssl`, `curl`.

```sh
./scripts/demo.sh init     # creates .env.docker with fresh secrets (never committed)
# optional: add ANTHROPIC_API_KEY, CARTESIA_API_KEY, APIFY_TOKEN to .env.docker
./scripts/demo.sh up       # starts Convex, deploys functions, seeds data, starts web + agent
```

- App: http://localhost:8080
- Convex dashboard: http://localhost:6791 (log in with `./scripts/demo.sh admin-key`)
- Health: http://127.0.0.1:3211/health

`./scripts/demo.sh reset` wipes the database and reseeds (demo reset). `down` stops everything, `logs` follows logs. After adding API keys, run `./scripts/demo.sh up` again.

Everything works without any API key: each sponsor integration has a fallback (see below).

## Local development

```sh
npm install
./scripts/demo.sh up                      # or just: docker compose --env-file .env.docker up -d backend dashboard
cp .env.example .env.local                # set CONVEX_SELF_HOSTED_ADMIN_KEY (./scripts/demo.sh admin-key)
npx convex dev                            # pushes convex/ on every save
npm run dev                               # Vite on http://localhost:5173
npm run doctor                            # checks every required variable exists (names only)
```

Server-side keys are set with `npx convex env set NAME value` and never appear in front-end code. The agent can also run outside Docker: `cd agent && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && set -a && . ./.env && set +a && .venv/bin/python main.py`.

| Command | What it does |
|---|---|
| `npm test` | Vitest unit tests: scorer, validators, evidence check, rules, voice grammar, copy lint, privacy spy |
| `npm run test:agent` | pytest: the Python scorer against the same shared fixtures as the TypeScript scorer |
| `npm run e2e` | Playwright journeys (A1, A3–A5, A8–A15) against a running stack (`E2E_BASE_URL`, default :5173) |
| `npm run test:a11y` | axe on all six routes in three modes (default, OpenDyslexic at 200%, high contrast) |
| `npm run test:integration` | Ownership, unauthenticated access and the "no disability data in agent payloads" spy test (stop the agent container first; needs `AGENT_SHARED_SECRET`) |
| `npm run build` | Typecheck, Vite build, then fail if any secret value appears in `dist/` |
| `npm run seed` / `npm run ingest` | Load DEMO + snapshot listings / run a live ingest |

## Architecture

```
BROWSER (untrusted)             CONVEX, self-hosted in Docker (trusted)        THIRD PARTIES
React app, 6 screens  <--live-->  queries & mutations (ownership check)          Claude API (extract, explain, draft)
Settings, voice, TTS player       database, files, Convex Auth                   Cartesia (TTS + word timings, STT)
                                  actions & crons (hold every API key)  ----->   Apify Actor -> Greenhouse / Lever
                                  HTTP actions /agent/claim /agent/result         (fallback: direct fetch)
                                         ^
                                         | HTTPS + bearer secret (pull model)
                                  AGENT (Docker): Fetch.ai uAgents MatchAgent, scores anonymous snapshots
```

- The browser talks only to Convex. Convex actions call Claude, Cartesia and Apify; keys live only in Convex env.
- Matching: the browser asks Convex to find jobs; Convex creates a request whose snapshot has **no disability data and no account identifiers**. The MatchAgent claims it, scores, and posts results. If no agent has polled recently (or none finishes within 8 s), Convex scores with the TypeScript fallback and the Jobs page says "Scored without the agent". Claude then writes short explanations from factor data only; any number or skill not in the data is rejected and a fixed sentence is used.
- Score = 100 × (0.60 S + 0.30 R + 0.10 L) − P: skills (required 1, preferred 0.5, aliases normalized), role (exact 1, adjacent 0.5), location (remote, no location set, or text match), minus 25 per explicit, quoted contradiction of a required accommodation (cap 40). Preferred accommodations and disability selections never affect ranking.
- Optional disability selections live in a separate `sensitiveProfiles` table that matching, agents, extraction and logs never read. They reach an email only if the user turns disclosure on for that draft; even then the disclosure sentence is inserted by code, not by Claude.

Repository: `src/` React app · `convex/` backend (`ai/`, `match/`, `ingest/`, `lib/`) · `shared/` types, taxonomy, fixtures · `agent/` Python MatchAgent · `tests/` e2e, a11y, integration · `docker/` images · `scripts/` demo, deploy, doctor · `docs/`.

## Sponsor tools: what each one does in the product

| Tool | Job in the product | Fallback when it is down or unset |
|---|---|---|
| **Convex** (self-hosted) | The whole backend: database, Convex Auth (email + password), file storage for resumes and audio, reactive queries, actions, crons (ingest, retention), HTTP actions for the agent | None needed (it is the backend) |
| **Anthropic Claude** | Resume skill extraction (PDF or text), listing extraction (skills, experience level, accommodation mentions with verbatim quotes), match explanations from factor data, accommodation email drafts. JSON-schema structured output; `claude-haiku-5-5` for extraction, `claude-sonnet-5-5` for writing | Rules-based extraction, template explanations and a fixed email template; notice "AI help is unavailable. You can still write this yourself." |
| **Cartesia** | Read aloud: TTS over SSE (`sonic-3.6`) with `add_timestamps` word timings for word-by-word highlighting, cached by text hash (job text only, capped at 1,500 characters). Voice: batch speech-to-text (`ink-whisper`) for push-to-talk commands and dictation | Browser speech synthesis with boundary highlighting ("Using your browser's voice"); keyboard and mouse for commands |
| **Apify** | Collects listings with the Store Actor `bovi/greenhouse-lever-ashby-job-scraper` for the curated employer list | Direct fetch of the same public Greenhouse and Lever endpoints (1 request/second), then the seeded data |
| **Fetch.ai uAgents** | MatchAgent: polls Convex for anonymous match requests, scores them with the shared rules, posts factor breakdowns back | TypeScript scorer in Convex (`engine: fallback`) |

## Data sources

- Curated public Greenhouse and Lever boards (25 employers, `convex/ingest/sources.ts`). Every card names its source, links to the original listing, and shows when it was checked; listings older than 72 hours are flagged.
- `convex/seedData/snapshot.json`: 200 real public listings collected once by the ingest pipeline (2026-10-24), so the demo works offline. Real apply links are kept.
- `shared/fixtures/demo-jobs.ts`: 12 fictional DEMO postings, always badged DEMO, covering every label (Stated, Verified, Unverified, Not mentioned) and one explicit on-site conflict.
- Terms review per source: `docs/sources.md` (sign-off pending).

## Accessibility

Target: WCAG 2.2 AA. Accessibility settings work before login (font: system, Atkinson Hyperlegible, OpenDyslexic; text 100–200%; line, letter and word spacing; high contrast; reduced motion) and apply instantly, persist locally and sync to the profile across devices. One `h1` per page with focus moved to it on route change, skip link, landmarks, live regions for results, saves and errors, labels on every control, 44 × 44 px primary targets, no information by color alone, Esc stops audio and closes dialogs. axe reports 0 critical and 0 serious issues on all six routes in three modes; manual NVDA/VoiceOver passes are still to do (see limitations).

## Responsible AI and privacy

- AI output is validated: listing quotes must appear verbatim in the listing or the claim is dropped; explanations may use only factor data; emails may name only the selected accommodations and no health term (else the fixed template is used). Resume and listing text is passed as delimited data.
- Nothing is copied, opened or sent until the user approves the draft; editing after approval resets it.
- Collected: email, password hash, skills, roles, accommodation choices, interface preferences, applications, drafts. Resume files are deleted right after extraction; match requests are purged after 24 h; closed listings after 30 days. "Delete all my data" (bottom of Profile) removes every row including the account and shows counts.
- Logs contain request IDs and error codes only.
- Demo data is synthetic. Real users would need a privacy and legal review first.

## Known limitations

- Claude extraction can misread listings and resumes; quotes show what a listing says, not what an employer will do; the score is a guide, not a hiring prediction. The email is a starting point, not legal advice.
- Without an Anthropic key, PDF resumes cannot be read (paste text instead) and listing extraction uses conservative rules, which find fewer accommodations.
- The Apify Actor's output field names are mapped from its input schema and README; they are confirmed only after the first run with a token (`// PROVISIONAL: S4`).
- Direct-fetch ingest takes a capped subset per board, so it cannot detect closed listings; only full Apify runs close missing listings.
- No email verification or password reset (needs an email provider); follow-up dates send no reminders.
- The resume upload trusts the storage ID from the signed-in client for the few seconds before the file is deleted.
- Manual screen-reader passes (NVDA, VoiceOver), precision@5 labelling (A6) and human accuracy review of Stated labels (A7) are assigned to a teammate and not yet done.
- English only; desktop and mobile web only.

## Statistic used in the pitch

"53% of Gen Z say they are neurodivergent" (Forbes, Sept 2026) traces to a 2023 ZenBusiness survey of about 1,000 people aged 18–25 who self-identified. It is not a prevalence rate and is used only as evidence of demand for flexible design.
