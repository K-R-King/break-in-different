# Break In Different

An inclusive career platform that helps job seekers with diverse accessibility needs find computer science roles, through personalized application support and tailored job matching. Built for Cal Hacks 13.0.

**The loop:** sign up → build a profile (skills from a resume, roles, required and preferred workplace accommodations, interface preferences) → see ranked CS jobs whose accommodation information is labelled with quoted evidence → draft an accommodation email you review and approve → apply on the employer's own site → track it.

What it never does: send anything for you, auto-apply, ask for a diagnosis, or say an employer lacks an accommodation. If a listing says nothing, the app says "Not mentioned in this listing. This does not mean it is unavailable."

## How we use Convex

- A self-hosted Convex backend holds the data, auth (Convex Auth) and every API key; the browser talks only to Convex.
- Jobs, Tracker, Email and Profile read through `useQuery`, so match results and status changes appear without a refresh.
- HTTP actions connect the Python MatchAgent and the voice assistant; actions call Claude and Cartesia.
- Crons, scheduled functions and file storage run ingest, Claude extraction, resume upload and interview audio.
- Evidence, files and a dated commit log: [hackathon.md](hackathon.md).

## Run the demo (no Docker, fastest)

### Environment requirements (no-Docker deployment)

| Requirement | Version | Used for |
|---|---|---|
| OS | macOS (Apple silicon or Intel) or Linux (x86_64 or arm64, glibc) | the prebuilt Convex backend binary; on Windows use WSL, or the Docker version |
| Node.js with npm | 22.12 or newer (Vite's minimum); an LTS line, 22 or 24, is safest | web build, Convex CLI, deploy step, static servers, tests. `demo.sh` stops if Node is older |
| Python | 3.11 or newer; 3.11 recommended | the matching agent (optional: without it matching uses its fallback). `demo.sh` picks `python3.11`, `3.12`, `3.13` or `python3`, if 3.11+ |
| `bash`, `curl`, `unzip`, `openssl` | any recent (macOS's bash 3.2 works) | the script, downloads, generated secrets |
| Free ports on 127.0.0.1 | 3210, 3211, 6791, 8080, 8000 | Convex API, Convex HTTP actions and `/health`, dashboard, app, agent (the agent listens on all interfaces). Stop the Docker version first |
| Disk | about 700 MB | Convex backend 167 MB, dashboard 26 MB, `node_modules` 333 MB, `agent/.venv` 141 MB, seeded database about 17 MB |
| Network, first run only | github.com, registry.npmjs.org, pypi.org | backend and dashboard (63 MB download), npm packages (skipped when `node_modules` matches `package-lock.json`), agent packages. Afterwards only the sponsor APIs, when their keys are set |
| Browser | current Chrome | the demo; tests use Playwright's Chromium (`npx playwright install chromium`) |

Packages are pinned: `package-lock.json` for npm (`npm ci`), and `requirements.txt` for the agent's Python packages (exact versions, tested on Python 3.11). `agent/requirements.txt` keeps the version ranges the Docker image installs; `agent/requirements-dev.txt` adds pytest.

Environment variables: none are required. `.env` holds the optional sponsor keys (created from `.env.example` on the first run; see "Environment files"), `.demo-local/env` holds the generated secrets, and `CONVEX_BACKEND_VERSION` optionally overrides the pinned backend build.

Tested on 2026-10-24: macOS on Apple silicon, Node 26.12.1, Python 3.11.15.

### Start it

```sh
./scripts/demo.sh up       # downloads what is missing, starts Convex, deploys functions, pushes keys, seeds data, starts web + agent
# put your API keys in .env (created on the first run; see "Environment files"), then:
./scripts/demo.sh keys     # re-pushes .env to Convex
npm run check:integrations # optional: confirms Claude, Cartesia and Apify work with your keys
```

- App: http://localhost:8080
- Demo login: `sam@example.com` / `break-in-different` (created by the seed with an empty profile: fill in Profile before finding jobs; `reset` recreates it)
- Convex dashboard: http://localhost:6791 (signed in automatically; the admin key is `./scripts/demo.sh admin-key`)
- Health: http://127.0.0.1:3211/health

`reset` wipes the database and reseeds (demo reset). `down` stops everything, `stop-agent` stops only the agent (fallback rehearsal), `logs` follows logs.

What it runs, all on 127.0.0.1 and on the same ports as the Docker version:

- the open-source Convex backend binary, pinned to the build the Docker image uses (`precompiled-2026-10-23-65a9491`; override with `CONVEX_BACKEND_VERSION`), downloaded once from the `convex/convex-backend` GitHub releases (56 MB);
- the Convex dashboard from the same release (7 MB), served by `scripts/serve-static.mjs`;
- the built web app, served by the same script with the security headers from `docker/nginx.conf`;
- the matching agent in `agent/.venv`, installed from `requirements.txt` in the background on the first run.

State lives in `.demo-local/` (gitignored): generated secrets, the database, pid files and logs. Only the deploy step reads `.env`; the backend, web server and agent never see the sponsor keys.

Everything works without any API key: each sponsor integration has a fallback (see below).

## Run with Docker Compose

Prerequisites: Docker Desktop (or OrbStack), `openssl`, `curl`. Uses the ports above, so stop the other version first.

```sh
./scripts/demo-docker.sh init  # creates .env.docker (generated secrets) and .env (from .env.example)
./scripts/demo-docker.sh up    # same steps as demo.sh up, in containers
```

`keys`, `reset`, `down`, `logs` and `admin-key` work as above. `npm run demo:docker` is the same as `up`.

Opening the app from another machine (e.g. a VPS)? Set `PUBLIC_HOST=<server IP or DNS name>` in `.env.docker`, open ports 8080, 3210 and 3211, then run `up` again. The browser reaches Convex at that host, so with the default `127.0.0.1` sign-in fails from any other machine.

Serving it on a domain over HTTPS? Point three hostnames at a reverse proxy (app → 8080, Convex API → 3210, Convex HTTP actions → 3211), set `CONVEX_URL`, `CONVEX_SITE_URL`, `SITE_URL` and `BIND_IP=127.0.0.1` in `.env.docker` (see `.env.docker.example`), then run `up` again. Everyone signs in again after the switch; data is kept.

### Startup time and optimization plan

Measured on 2026-10-24 (Apple silicon, OrbStack):

| Phase | Time | Notes |
|---|---|---|
| `demo.sh up`, first run | 90 s | 76 s of it downloading the backend and dashboard from GitHub (network-bound, once) |
| `demo.sh up` or `reset`, downloads cached | 10 s | |
| Pull `convex-backend` + `convex-dashboard` (Docker) | download-bound | 798 MB + 688 MB unpacked; the largest cost on a fresh machine |
| Build `web`, `deploy`, `agent` with no cache (Docker) | 48 s (parallel) | agent `pip install` 44 s, `npm ci` 33 s, `vite build` about 8 s |
| `deploy` step (push functions, env vars, seed) | about 5 s | same script in both versions |
| `demo-docker.sh up` with everything cached | 12 s | |
| Claude extraction of the 369 listings after a reset | about 5 min | matching only sees listings that are already extracted |

The `deploy` image is 847 MB because it installs all 358 MB of `node_modules`, including the test and lint tools. The agent's `pip install` builds nothing from source; the time goes to resolving versions, because `agent/requirements.txt` only sets lower bounds.

Planned, most useful first (not done yet; the no-Docker script already avoids the image pulls and builds):

1. **Pre-extracted seed** (Chris + Mark): store each listing's extraction results in `convex/seedData/snapshot.json` and load them at seed time, so a reset shows real matches in seconds, even without a Claude key.
2. **Pin the Convex images** (Chris): replace `:latest` with digests in `docker-compose.yml`, as `demo.sh` already pins its backend version, so a new Convex release cannot change the demo. Current digests: backend `sha256:df3e32d53c43…`, dashboard `sha256:64f69f6f5620…`.
3. **Pull and build in parallel** (Chris): `demo-docker.sh up` currently starts the backend, then builds `deploy`, then builds `web` and `agent`. Run `docker compose pull` and `docker compose --profile tools build` together first, so the builds overlap the download.
4. **Slim the `deploy` image** (Chris): `npm ci --omit=dev`. This needs `scripts/generate-keys.mjs` to use Node's built-in `crypto` instead of `jose`, which is a dev dependency.
5. **npm cache mount** (Chris): `RUN --mount=type=cache,target=/root/.npm npm ci` in both Node Dockerfiles; it speeds up rebuilds after a dependency change.
6. **Lock the agent's Python dependencies** (Mark): `demo.sh` already installs the exact versions in `requirements.txt`; the agent's Dockerfile could install the same file to cut most of its 44 s.

The Convex dashboard stays in the default stack: it is the quickest way to inspect tables and functions.

To time a cold build, use `docker compose --env-file .env.docker --profile tools build --no-cache`. On OrbStack's containerd image store, `docker builder prune` and `docker system df` do not show or clear every cached layer.

## Environment files

All real env files are gitignored; only the `*.example` templates (names, no values) are tracked.

| File | Holds | Created by | Read by |
|---|---|---|---|
| `.env` | Sponsor API keys: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_EXTRACT`, `CLAUDE_MODEL_WRITE`, `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`, `APIFY_TOKEN`, `MOCK_AI`, `SCHEDULED_INGEST` (1 turns on the daily scrape; off by default for demos) | you (`cp .env.example .env`, or the first `demo.sh up` / `demo-docker.sh init`) | the deploy step (`scripts/deploy.sh`, in the `deploy` container for Docker), which pushes them into the Convex server environment |
| `.demo-local/env` | Generated infrastructure secrets for the no-Docker demo: `CONVEX_INSTANCE_SECRET`, `AGENT_SHARED_SECRET`, `CONVEX_SELF_HOSTED_ADMIN_KEY` | `demo.sh up` | `demo.sh` (backend, agent, deploy step) |
| `.env.docker` | The same secrets for the Docker demo | `demo-docker.sh init` / `up` | Docker Compose, the agent |
| `.env.local` | `CONVEX_SELF_HOSTED_URL`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, `VITE_CONVEX_URL` (public URL only) | you (`.env.local.example`) | `npx convex` CLI, Vite |
| `agent/.env` | `CONVEX_SITE_URL`, `AGENT_SHARED_SECRET` (only when running the agent outside Docker) | you (`agent/.env.example`) | the agent |

API keys live only in the Convex server environment; the browser bundle, the agent and logs never contain them (`npm run build` fails if a secret value appears in `dist/`). Leaving a key empty and running `demo.sh keys` removes it from Convex so the fallback is used.

## Local development

```sh
npm install
./scripts/demo.sh up                      # or ./scripts/demo-docker.sh up
cp .env.local.example .env.local          # set CONVEX_SELF_HOSTED_ADMIN_KEY (./scripts/demo.sh admin-key)
npx convex dev                            # pushes convex/ on every save
npm run dev                               # Vite on http://localhost:5173
npm run doctor                            # checks every required variable exists (names only)
```

Server-side keys come from `.env` via `./scripts/demo.sh keys` (or `npx convex env set NAME value`) and never appear in front-end code. The agent can also run outside Docker: `cd agent && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && set -a && . ./.env && set +a && .venv/bin/python main.py`.

| Command | What it does |
|---|---|
| `npm test` | Vitest unit tests: scorer, validators, evidence check, rules, voice grammar, copy lint, privacy spy |
| `npm run test:agent` | pytest: the Python scorer against the same shared fixtures as the TypeScript scorer |
| `npm run e2e` | Playwright journeys (A1, A3–A5, A8–A15) against a running stack (`E2E_BASE_URL`, default :5173) |
| `npm run test:a11y` | axe on all six routes in three modes (default, OpenDyslexic at 200%, high contrast) |
| `npm run test:integration` | Ownership, unauthenticated access and the "no disability data in agent payloads" spy test (stop the agent first with `./scripts/demo.sh stop-agent`; needs `AGENT_SHARED_SECRET`) |
| `npm run build` | Typecheck, Vite build, then fail if any secret value appears in `dist/` |
| `npm run check:integrations` | Spikes S2–S7 with the real keys: Claude extraction, conflict, PDF→skills, explanation, email drafts; Cartesia TTS timestamps and STT round trip; Apify Actor run and field names |
| `npm run seed` / `npm run ingest` | Load DEMO + snapshot listings and the demo login / run a live ingest |
| `./scripts/build-seed.sh` | Re-scrape the curated boards (direct, about 1 request/second) and replace `convex/seedData/snapshot.json` with that run's listings; then `./scripts/demo.sh reset` loads it |

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
| **Cartesia** | Every voice in the app: read aloud, the practice interviewer, the voice assistant's replies, live voice control and dictation (details below) | Browser speech synthesis ("Using your browser's voice") for anything spoken; keyboard and mouse instead of voice input |
| **Apify** | Collects listings with the Store Actor `bovi/greenhouse-lever-ashby-job-scraper` for the curated employer list | Direct fetch of the same public Greenhouse and Lever endpoints (1 request/second), then the seeded data |
| **Fetch.ai uAgents** | MatchAgent: polls Convex for anonymous match requests, scores them with the shared rules, posts factor breakdowns back | TypeScript scorer in Convex (`engine: fallback`) |

### Cartesia features we use

All calls send `Cartesia-Version: 2026-08-14`. The API key stays in Convex; the browser only ever gets short-lived access tokens.

| Feature in the app | Cartesia API | Code |
|---|---|---|
| Read a job aloud with word-by-word highlighting | Sonic TTS over SSE (`sonic-3.6`) with word timestamps; audio cached in Convex file storage by text hash | `convex/tts.ts`, `src/voice/reader.tsx` |
| Practice interview: the interviewer speaks each question | Same Sonic SSE call, with word timings for highlighting | `convex/ai/practice.ts` |
| Voice assistant speaks its replies | Sonic TTS over WebSocket from the browser, one sentence at a time as Claude writes it | `src/voice/agent/speech.ts` |
| Live voice control (the voice button: speak and the page follows) | Ink 2 speech-to-text over the turns WebSocket, with built-in end-of-turn detection | `src/voice/live/turnsSocket.ts` |
| "Hold to talk" commands, dictation and spoken practice answers | Batch speech-to-text (`ink-whisper`) | `convex/stt.ts`, `src/voice/VoiceProvider.tsx` |
| Browser access without exposing the key | `POST /access-token` with TTS and STT grants, 60-second tokens | `convex/voice.ts` |

Without a Cartesia key, everything spoken falls back to the browser's voice, and voice input is off (keyboard and mouse still do everything). `npm run check:integrations -- cartesia` checks the TTS timestamps and an STT round trip with your key.

## Data sources

- Curated public Greenhouse and Lever boards (25 employers, `convex/ingest/sources.ts`). Every card names its source, links to the original listing, and shows when it was checked; listings older than 72 hours are flagged.
- `convex/seedData/snapshot.json`: real public listings collected by `scripts/build-seed.sh`, so the demo works offline. Real apply links are kept. When a listing links to the employer's own accommodation request form (a form link in a paragraph about accommodations), the link and the sentence around it are kept; those jobs show an "Accommodation form" badge, come first on the job board (a filter shows only them), and "Request accommodations" opens that form (the email draft stays available). When a listing's accommodation statement gives an address (for example accommodations@duolingo.com), job details show "This employer accepts accommodation requests" with the quote, and the email's To field is filled in from it.
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
- The Apify Actor works (confirmed with a real run, 2026-10-25), but it returns no listing HTML, shortened Lever descriptions, and rows sorted by title, so a run keeps very few engineering roles. The demo listings come from the direct path (`scripts/build-seed.sh`), which is also the only path that finds accommodation forms. Details: `docs/open-questions.md` #10.
- Direct-fetch ingest takes a capped subset per board, so it cannot detect closed listings; Apify runs do close missing listings, and with the sorting above they can close listings that are still open.
- Voice input (live voice, "Hold to talk", dictation, spoken practice answers) needs a Cartesia key; there is no browser speech-recognition fallback. Dictation recordings are limited to about a minute, and read aloud covers the first 1,500 characters of a job.
- Per-user hourly limits apply to Cartesia (30 read-aloud calls, 120 dictations, 240 live voice tokens) and Claude (20 calls). On the live site they share the team's keys.
- No email verification or password reset (needs an email provider); follow-up dates send no reminders.
- The resume upload trusts the storage ID from the signed-in client for the few seconds before the file is deleted.
- Manual screen-reader passes (NVDA, VoiceOver), precision@5 labelling (A6) and human accuracy review of Stated labels (A7) are assigned to a teammate and not yet done.
- English only; desktop and mobile web only.

## Roadmap (outside the MVP)

The original project description also covers **students** and **adaptable educational resources** (learning content in formats matched to each person's interface preferences). These are out of scope for the hackathon MVP (brief C7) and are the next major area after the core job-search loop, along with partner feeds from disability-focused job boards, employer-verified accommodation profiles, reminders, and real distance filtering.

## Statistic used in the pitch

"53% of Gen Z say they are neurodivergent" (Forbes, Sept 2026) traces to a 2023 ZenBusiness survey of about 1,000 people aged 18–25 who self-identified. It is not a prevalence rate and is used only as evidence of demand for flexible design.
